const createScoringService = ({ db, io, sessionState, markSessionTouched }) => {
  const determineGameWinner = (sessionId, callback) => {
    db.all(
      `SELECT g.id AS group_id, g.name, g.avatar_url, cp.red_triangles, cp.green_triangles
       FROM groups g
       LEFT JOIN camembert_progress cp ON g.id = cp.group_id
       WHERE g.session_id = ?`,
      [sessionId],
      (err, groups) => {
        if (err) {
          console.error("Error fetching groups for game over:", err);
          return callback(null);
        }

        if (!groups.length) {
          return callback(null);
        }

        let winners = [];
        let maxCamemberts = 0;
        let maxPoints = 0;

        groups.forEach((group) => {
          const completeCamemberts = Math.min(
            Math.floor(group.green_triangles / 4),
            Math.floor(group.red_triangles / 4)
          );

          const totalPoints = group.green_triangles + group.red_triangles;

          if (completeCamemberts > maxCamemberts) {
            maxCamemberts = completeCamemberts;
            maxPoints = totalPoints;
            winners = [group];
          } else if (completeCamemberts === maxCamemberts) {
            if (totalPoints > maxPoints) {
              maxPoints = totalPoints;
              winners = [group];
            } else if (totalPoints === maxPoints) {
              winners.push(group);
            }
          }
        });

        callback(winners);
      }
    );
  };

  const handleGameOver = (sessionId) => {
    determineGameWinner(sessionId, (winners) => {
      if (sessionState[sessionId]) {
        sessionState[sessionId].currentQuestion = null;
        sessionState[sessionId].currentQuestionStartedAt = null;
        sessionState[sessionId].currentQuestionDuration = 0;
        sessionState[sessionId].submittedAnswers = [];
        sessionState[sessionId].stoppedTimerGroup = null;
        sessionState[sessionId].revealedAnswer = null;
        sessionState[sessionId].winners = winners;
        markSessionTouched(sessionId);
      }

      io.to(sessionId).emit("gameOver", {
        winners: winners.length > 1 ? winners : winners[0] || null,
        isTie: winners.length > 1,
      });

      db.run(
        `UPDATE game_sessions SET status = 'Game Over' WHERE id = ?`,
        [sessionId],
        function (err) {
          if (err) {
            console.error("Error updating session status:", err);
          }
        }
      );
    });
  };

  return {
    determineGameWinner,
    handleGameOver,
  };
};

module.exports = {
  createScoringService,
};
