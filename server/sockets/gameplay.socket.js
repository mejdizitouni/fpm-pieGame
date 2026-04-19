const registerGameplaySocketHandlers = ({
  io,
  db,
  sessionState,
  createSessionRuntimeState,
  markSessionTouched,
  isValidPositiveInt,
  handleGameOver,
}) => {
  io.on("connection", (socket) => {
    socket.on("startGame", (sessionId) => {
      if (!isValidPositiveInt(sessionId)) {
        return;
      }

      if (!sessionState[sessionId]) {
        sessionState[sessionId] = createSessionRuntimeState();

        db.get(
          `SELECT COUNT(*) as total FROM session_questions WHERE session_id = ?`,
          [sessionId],
          (err, result) => {
            if (err || !result) {
              console.error("Error fetching total questions:", err);
              return;
            }

            sessionState[sessionId].totalQuestions = result.total;
            fetchNextQuestion(sessionId);
          }
        );
      } else {
        fetchNextQuestion(sessionId);
      }
    });

    const fetchNextQuestion = (sessionId) => {
      const state = sessionState[sessionId];
      if (!state) {
        return;
      }

      markSessionTouched(sessionId);

      if (state.currentIndex >= state.totalQuestions) {
        handleGameOver(sessionId);
        return;
      }

      const questionType = state.currentIndex % 2 === 0 ? "green" : "red";
      const notInClause = state.askedQuestions.size
        ? `AND q.id NOT IN (${[...state.askedQuestions].join(",")})`
        : "";

      const sql = `
      SELECT q.*
      FROM questions q
      JOIN session_questions sq ON q.id = sq.question_id
      WHERE sq.session_id = ? AND q.type = ? ${notInClause}
      ORDER BY sq.question_order ASC
      LIMIT 1
    `;

      db.get(sql, [sessionId, questionType], (err, question) => {
        if (err || !question) {
          handleGameOver(sessionId);
          return;
        }

        state.askedQuestions.add(question.id);
        state.currentIndex += 1;
        state.currentQuestion = question;
        state.currentQuestionStartedAt = Date.now();
        state.currentQuestionDuration = question.allocated_time || 30;
        state.submittedAnswers = [];
        state.stoppedTimerGroup = null;
        state.revealedAnswer = null;
        state.winners = [];

        if (questionType === "red") {
          db.all(
            `SELECT id, option_text FROM question_options WHERE question_id = ?`,
            [question.id],
            (optionsErr, options) => {
              if (optionsErr) {
                console.error("Error fetching options:", optionsErr);
                handleGameOver(sessionId);
                return;
              }

              state.currentQuestion = { ...question, options };

              io.to(sessionId).emit("newQuestion", {
                question: { ...question, options },
                timer: question.allocated_time || 30,
                questionIndex: state.currentIndex,
                totalQuestions: state.totalQuestions,
                response_type: question.response_type,
              });
            }
          );
        } else {
          io.to(sessionId).emit("newQuestion", {
            question,
            timer: question.allocated_time || 30,
            questionIndex: state.currentIndex,
            totalQuestions: state.totalQuestions,
            response_type: state.response_type,
          });
        }
      });
    };

    socket.on(
      "submitAnswer",
      ({ sessionId, groupId, questionId, answer, stoppedTimer }) => {
        if (
          !isValidPositiveInt(sessionId) ||
          !isValidPositiveInt(groupId) ||
          !isValidPositiveInt(questionId)
        ) {
          return;
        }

        markSessionTouched(sessionId);
        const timeSubmitted = new Date().toISOString();

        db.get(`SELECT name FROM groups WHERE id = ?`, [groupId], (err, group) => {
          if (err || !group) {
            console.error("Error fetching group name:", err);
            return;
          }

          const groupName = group.name;

          const submittedAnswer = {
            sessionId,
            groupId,
            questionId,
            answer,
            stoppedTimer,
            groupName,
            timeSubmitted,
          };

          if (sessionState[sessionId]) {
            sessionState[sessionId].submittedAnswers.push(submittedAnswer);
            if (stoppedTimer) {
              sessionState[sessionId].stoppedTimerGroup = { groupId, groupName };
            }
          }

          io.to(sessionId).emit("answerSubmitted", submittedAnswer);

          if (stoppedTimer) {
            io.to(sessionId).emit("timerStopped", { groupId, groupName });
          }
        });
      }
    );

    socket.on(
      "validateAnswer",
      ({ sessionId, groupId, questionId, isCorrect, stoppedTimer }) => {
        if (
          !isValidPositiveInt(sessionId) ||
          !isValidPositiveInt(groupId) ||
          !isValidPositiveInt(questionId)
        ) {
          return;
        }

        markSessionTouched(sessionId);

        db.get(
          `SELECT type, expected_answer FROM questions WHERE id = ?`,
          [questionId],
          (err, question) => {
            if (err || !question) {
              console.error("Error fetching question details:", err);
              return;
            }

            const correctAnswer = question.expected_answer;
            const triangleType =
              question.type === "red" ? "red_triangles" : "green_triangles";

            db.get(`SELECT name FROM groups WHERE id = ?`, [groupId], (groupErr, group) => {
              if (groupErr || !group) {
                console.error("Error fetching group name:", groupErr);
                return;
              }

              const groupName = group.name;
              const onTransactionError = (label, transactionErr) => {
                console.error(label, transactionErr);
                db.run("ROLLBACK", () => {});
              };

              db.serialize(() => {
                db.run("BEGIN IMMEDIATE TRANSACTION", (beginErr) => {
                  if (beginErr) {
                    onTransactionError("Failed to start transaction:", beginErr);
                    return;
                  }

                  const commitAndBroadcast = () => {
                    db.run("COMMIT", (commitErr) => {
                      if (commitErr) {
                        onTransactionError("Failed to commit transaction:", commitErr);
                        return;
                      }

                      db.all(
                        `SELECT g.id AS group_id, g.avatar_url AS avatar_url, g.name, cp.red_triangles, cp.green_triangles
                         FROM groups g
                         LEFT JOIN camembert_progress cp ON g.id = cp.group_id
                         WHERE g.session_id = ?`,
                        [sessionId],
                        (camembertsErr, updatedCamemberts) => {
                          if (camembertsErr) {
                            console.error(
                              "Error fetching updated camembert scores:",
                              camembertsErr
                            );
                            return;
                          }

                          io.to(sessionId).emit("camembertUpdated", {
                            updatedCamemberts,
                          });
                        }
                      );

                      io.to(sessionId).emit("answerValidated", {
                        groupId,
                        groupName,
                        isCorrect,
                        correctAnswer,
                        messageKey: isCorrect
                          ? "socketValidateCorrect"
                          : "socketValidateIncorrectOthersGain",
                        messageParams: isCorrect
                          ? {
                              groupName,
                              correctAnswer,
                              points: stoppedTimer ? 2 : 1,
                            }
                          : { groupName },
                      });
                    });
                  };

                  if (isCorrect) {
                    const points = stoppedTimer ? 2 : 1;
                    db.run(
                      `UPDATE camembert_progress SET ${triangleType} = ${triangleType} + ? WHERE group_id = ?`,
                      [points, groupId],
                      (updateErr) => {
                        if (updateErr) {
                          onTransactionError(
                            "Error updating scores for the correct answer:",
                            updateErr
                          );
                          return;
                        }

                        commitAndBroadcast();
                      }
                    );
                  } else {
                    db.run(
                      `UPDATE camembert_progress
                       SET ${triangleType} = ${triangleType} + 1
                       WHERE group_id IN (
                         SELECT id FROM groups WHERE session_id = ? AND id != ?
                       )`,
                      [sessionId, groupId],
                      (updateErr) => {
                        if (updateErr) {
                          onTransactionError(
                            "Error updating scores for other groups:",
                            updateErr
                          );
                          return;
                        }

                        commitAndBroadcast();
                      }
                    );
                  }
                });
              });
            });
          }
        );
      }
    );

    socket.on(
      "validateAnswerNoPoints",
      ({ sessionId, groupId, questionId, isCorrect }) => {
        if (
          !isValidPositiveInt(sessionId) ||
          !isValidPositiveInt(groupId) ||
          !isValidPositiveInt(questionId)
        ) {
          return;
        }

        markSessionTouched(sessionId);

        db.get(
          `SELECT expected_answer FROM questions WHERE id = ?`,
          [questionId],
          (err, question) => {
            if (err || !question) {
              console.error("Error fetching question details:", err);
              return;
            }

            const correctAnswer = question.expected_answer;

            db.get(`SELECT name FROM groups WHERE id = ?`, [groupId], (groupErr, group) => {
              if (groupErr || !group) {
                console.error("Error fetching group name:", groupErr);
                return;
              }

              const groupName = group.name;

              io.to(sessionId).emit("answerValidatedNoPoints", {
                groupId,
                groupName,
                isCorrect,
                correctAnswer,
                messageKey: isCorrect
                  ? "socketValidateNoPointsCorrect"
                  : "socketValidateNoPointsIncorrect",
                messageParams: {
                  groupName,
                  correctAnswer,
                },
              });
            });
          }
        );
      }
    );

    socket.on("revealAnswer", ({ sessionId, correctAnswer }) => {
      if (!isValidPositiveInt(sessionId)) {
        return;
      }

      markSessionTouched(sessionId);
      if (sessionState[sessionId]) {
        sessionState[sessionId].revealedAnswer = correctAnswer;
      }
      io.to(sessionId).emit("revealAnswer", correctAnswer);
    });

    socket.on("nextQuestion", (sessionId) => {
      if (!isValidPositiveInt(sessionId)) {
        return;
      }

      fetchNextQuestion(sessionId);
    });

    socket.on("joinSession", ({ sessionId }) => {
      if (!isValidPositiveInt(sessionId)) {
        return;
      }

      socket.join(sessionId);
      markSessionTouched(sessionId);
    });

    socket.on("disconnect", () => {});
  });
};

module.exports = {
  registerGameplaySocketHandlers,
};
