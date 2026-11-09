import { Check as CheckIcon, CircleHelp, X } from "lucide-react";
import type { Check } from "@/lib/engine";

export default function CheckList({ checks }: { checks: Check[] }) {
  return (
    <ul className="checks" aria-label="Rule checks">
      {checks.map((c, i) => (
        <li
          key={i}
          className={
            (c.pass === null ? "unknown" : c.pass ? "pass" : "fail") +
            (c.label.startsWith("  · ") ? " sub" : "")
          }
        >
          <span>
            {c.pass === null ? (
              <CircleHelp size={14} aria-label="Unknown" />
            ) : c.pass ? (
              <CheckIcon size={14} aria-label="Met" />
            ) : (
              <X size={14} aria-label="Not met" />
            )}
          </span>
          {c.label.replace("  · ", "")}
        </li>
      ))}
    </ul>
  );
}
