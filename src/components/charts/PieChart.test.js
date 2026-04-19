import React from "react";
import { render } from "@testing-library/react";
import PieChart from "./PieChart";

describe("PieChart", () => {
  beforeEach(() => {
    const mockContext = {
      beginPath: jest.fn(),
      moveTo: jest.fn(),
      arc: jest.fn(),
      fill: jest.fn(),
      stroke: jest.fn(),
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 0,
    };

    jest
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockImplementation(() => mockContext);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("renders a canvas for segment drawing", () => {
    const { container } = render(
      <PieChart segments={["red", "green", "grey", "red"]} />
    );

    const canvas = container.querySelector("canvas");
    expect(canvas).toBeTruthy();
    expect(canvas.width).toBe(300);
    expect(canvas.height).toBe(300);
  });
});
