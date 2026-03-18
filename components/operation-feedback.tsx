type OperationFeedbackProps = {
  tone: "info" | "success" | "warning" | "error";
  title?: string;
  message: string;
};

export function OperationFeedback({ tone, title, message }: OperationFeedbackProps) {
  const classes = feedbackClasses(tone);

  return (
    <div className={`rounded-[28px] px-5 py-4 text-sm ${classes.wrapper}`}>
      {title ? <p className={`font-semibold ${classes.title}`}>{title}</p> : null}
      <p className={title ? `mt-1 ${classes.message}` : classes.message}>{message}</p>
    </div>
  );
}

function feedbackClasses(tone: OperationFeedbackProps["tone"]) {
  if (tone === "success") {
    return {
      wrapper: "bg-emerald-50",
      title: "text-emerald-900",
      message: "text-emerald-800"
    };
  }

  if (tone === "warning") {
    return {
      wrapper: "bg-amber-50",
      title: "text-amber-900",
      message: "text-amber-800"
    };
  }

  if (tone === "error") {
    return {
      wrapper: "bg-rose-50",
      title: "text-rose-900",
      message: "text-rose-800"
    };
  }

  return {
    wrapper: "bg-sky-50",
    title: "text-sky-900",
    message: "text-sky-800"
  };
}
