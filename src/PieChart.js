import { useEffect, useRef } from "react";

const PieChart = ({ segments }) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    const totalTriangles = segments.length; // Total triangles in this pie
    const triangleWidth = (Math.PI * 2) / totalTriangles;

    let startAngle = 0;

    // Draw each segment with specific colors based on the "segments" array
    segments.forEach((segment) => {
      ctx.beginPath();
      ctx.moveTo(150, 150); // Center of the canvas
      ctx.arc(150, 150, 100, startAngle, startAngle + triangleWidth);

      // Set color based on segment type
      ctx.fillStyle =
        segment === "red"
          ? "#FB4141" // Fixed red color
          : segment === "green"
          ? "#5CB338" // Fixed green color
          : "#C8C8C8"; // Grey for unfilled segments
      ctx.fill();

      startAngle += triangleWidth;
    });
  }, [segments]);

  return <canvas ref={canvasRef} width="300" height="300"></canvas>;
};

export default PieChart;
