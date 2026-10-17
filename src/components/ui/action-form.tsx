"use client";

import { startTransition, useEffect, useRef, type ComponentProps, type FormEvent } from "react";

type Props = Omit<ComponentProps<"form">, "action" | "onSubmit"> & {
  /** The dispatch function returned by useActionState. */
  action: (formData: FormData) => void;
  /** The action's latest result: the form is cleared only after a successful save. */
  state?: { ok?: boolean } | null;
};

/**
 * A form for useActionState actions that keeps what the user typed when the action fails.
 *
 * React resets every uncontrolled field after a function passed to `<form action>` completes,
 * so a rejected save (validation error, duplicate plate, storage down…) used to wipe the whole
 * form and hide the problem. Submitting through onSubmit avoids that reset; a successful save
 * still clears the form, as before.
 */
export function ActionForm({ action, state, children, ...props }: Props) {
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const formData = new FormData(event.currentTarget, submitter);
    startTransition(() => action(formData));
  }

  return (
    <form ref={ref} onSubmit={onSubmit} {...props}>
      {children}
    </form>
  );
}
