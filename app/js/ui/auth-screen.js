// The sign-in screen: email and the 6-digit PIN (spec 6.1). The PIN goes nowhere except into onSubmit,
// and is cleared from the field once sign-in succeeds.

const PIN_RE = /^\d{6}$/;

// els: { form, email, pin, button }. onSubmit(email, pin) signs in and resolves true on success (it shows
// its own errors). notify(text, kind) shows a message. Returns { setBusy, focus }.
export function mountAuthScreen({ form, email, pin, button }, { onSubmit, notify }) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    notify('');
    if (!PIN_RE.test(pin.value)) {
      notify('Enter your 6-digit PIN.', 'error');
      return;
    }
    if (await onSubmit(email.value.trim(), pin.value)) pin.value = '';
  });
  return {
    setBusy(busy) {
      button.disabled = busy;
    },
    focus() {
      (email.value ? pin : email).focus();
    },
  };
}
