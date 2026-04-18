const listeners = [];

export const toastEmitter = {
  emit(toast) {
    listeners.forEach((fn) => fn(toast));
  },
  subscribe(fn) {
    listeners.push(fn);
    return () => {
      const idx = listeners.indexOf(fn);
      if (idx > -1) listeners.splice(idx, 1);
    };
  },
};

let nextId = 0;

export const toast = {
  success: (message, duration = 3000) =>
    toastEmitter.emit({ id: ++nextId, message, type: "success", duration }),
  error: (message, duration = 4500) =>
    toastEmitter.emit({ id: ++nextId, message, type: "error", duration }),
  info: (message, duration = 3500) =>
    toastEmitter.emit({ id: ++nextId, message, type: "info", duration }),
  warning: (message, duration = 4000) =>
    toastEmitter.emit({ id: ++nextId, message, type: "warning", duration }),
};
