import type { StudentSummary } from "@end-show/api/routers/student";
import { motion } from "motion/react";

export function SentFlash({ student }: { student: StudentSummary }) {
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <motion.div
        initial={{ scale: 0.7, y: 24 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: -10 }}
        transition={{ type: "spring", stiffness: 260, damping: 14 }}
        className="bg-slide rounded-md px-10 py-7 font-display text-3xl font-black tracking-tight text-chalkboard shadow-[0_30px_80px_rgba(255,91,35,0.7)] sm:text-4xl"
      >
        sent{" "}
        <span className="opacity-70">{student.displayName.split(" ")[0]}</span>{" "}
        to stage <span className="opacity-60">↑</span>
      </motion.div>
    </motion.div>
  );
}
