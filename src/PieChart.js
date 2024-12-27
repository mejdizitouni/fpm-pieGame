import { useEffect, useRef } from 'react';

const PieChart = ({ redPoints, greenPoints }) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    const totalTriangles = 8; // Total triangles in the pie
    const redTriangles = redPoints;  // Number of red triangles
    const greenTriangles = greenPoints; // Number of green triangles
    const remainingTriangles = totalTriangles - redTriangles - greenTriangles; // Remaining triangles that are light green or red

    const triangleWidth = Math.PI * 2 / totalTriangles;

    // Draw base pie chart (light red for the red triangles and light green for the green triangles initially)
    let startAngle = 0;

    // Draw red triangles (light red color initially)
    for (let i = 0; i < redTriangles; i++) {
      ctx.beginPath();
      ctx.moveTo(150, 150); // Center of the canvas
      ctx.arc(150, 150, 100, startAngle, startAngle + triangleWidth);
      ctx.fillStyle = `rgb(${255 - (i * 40)}, 100, 100)`; // Light red color for initial state
      ctx.fill();
      startAngle += triangleWidth;
    }

    // Draw green triangles (light green color initially)
    for (let i = 0; i < greenTriangles; i++) {
      ctx.beginPath();
      ctx.moveTo(150, 150);
      ctx.arc(150, 150, 100, startAngle, startAngle + triangleWidth);
      ctx.fillStyle = `rgb(100, ${255 - (i * 40)}, 100)`; // Light green color for initial state
      ctx.fill();
      startAngle += triangleWidth;
    }

    // Draw the remaining triangles (light red or light green)
    for (let i = 0; i < remainingTriangles; i++) {
      ctx.beginPath();
      ctx.moveTo(150, 150);
      ctx.arc(150, 150, 100, startAngle, startAngle + triangleWidth);
      ctx.fillStyle = `rgb(200, 200, 200)`; // A lighter color for the remaining triangles (if any)
      ctx.fill();
      startAngle += triangleWidth;
    }

    // Draw red triangles (dark red color) for the points earned
    startAngle = 0;
    for (let i = 0; i < redTriangles; i++) {
      ctx.beginPath();
      ctx.moveTo(150, 150);
      ctx.arc(150, 150, 100, startAngle, startAngle + triangleWidth);
      ctx.fillStyle = `rgb(${255 - (i * 40)}, 0, 0)`; // Darker red for earned points
      ctx.fill();
      startAngle += triangleWidth;
    }

    // Draw green triangles (dark green color) for the points earned
    for (let i = 0; i < greenTriangles; i++) {
      ctx.beginPath();
      ctx.moveTo(150, 150);
      ctx.arc(150, 150, 100, startAngle, startAngle + triangleWidth);
      ctx.fillStyle = `rgb(0, ${255 - (i * 40)}, 0)`; // Darker green for earned points
      ctx.fill();
      startAngle += triangleWidth;
    }

  }, [redPoints, greenPoints]);

  return <canvas ref={canvasRef} width="300" height="300"></canvas>;
};

export default PieChart;
