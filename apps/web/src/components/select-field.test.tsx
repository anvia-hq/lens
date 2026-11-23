// @vitest-environment happy-dom

import { SelectField } from "@lens/ui/components/select";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

const options = [
  { value: "", label: "Any review" },
  { value: "pass", label: "Pass" },
  { value: "fail", label: "Fail" },
];

describe("SelectField", () => {
  it("shows the label of the selected option, including an empty-string value", () => {
    const { rerender } = render(
      <SelectField aria-label="Review" value="" onValueChange={() => {}} options={options} />,
    );
    expect(screen.getByRole("combobox", { name: "Review" }).textContent).toContain("Any review");

    rerender(
      <SelectField aria-label="Review" value="fail" onValueChange={() => {}} options={options} />,
    );
    expect(screen.getByRole("combobox", { name: "Review" }).textContent).toContain("Fail");
  });

  it("reports the picked value", async () => {
    const onValueChange = vi.fn();
    render(
      <SelectField aria-label="Review" value="" onValueChange={onValueChange} options={options} />,
    );
    const trigger = screen.getByRole("combobox", { name: "Review" });
    fireEvent.pointerDown(trigger, { button: 0, pointerType: "mouse" });
    fireEvent.mouseDown(trigger);
    fireEvent.click(trigger);
    const option = await screen.findByRole("option", { name: "Pass" });
    fireEvent.pointerDown(option, { button: 0, pointerType: "mouse" });
    fireEvent.pointerUp(option, { button: 0, pointerType: "mouse" });
    fireEvent.mouseUp(option);
    fireEvent.click(option);
    expect(onValueChange).toHaveBeenCalledWith("pass");
  });
});
