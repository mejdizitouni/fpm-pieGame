import { toastEmitter, toast } from "./toast";

describe("toast emitter", () => {
  test("emits success toast messages to subscribers", () => {
    const received = [];
    const unsubscribe = toastEmitter.subscribe((event) => {
      received.push(event);
    });

    toast.success("Saved", 1500);

    expect(received.length).toBe(1);
    expect(received[0].message).toBe("Saved");
    expect(received[0].type).toBe("success");
    expect(received[0].duration).toBe(1500);

    unsubscribe();
  });

  test("unsubscribe stops further event delivery", () => {
    const received = [];
    const unsubscribe = toastEmitter.subscribe((event) => {
      received.push(event);
    });

    unsubscribe();
    toast.error("Failure", 2000);

    expect(received.length).toBe(0);
  });
});
