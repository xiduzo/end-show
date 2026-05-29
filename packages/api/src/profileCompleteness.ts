type StudentProfileFields = {
  displayName: string | null | undefined;
  pronouns: string | null | undefined;
  introduction: string | null | undefined;
  workMediaUrl: string | null | undefined;
};

export function isStudentProfileComplete(
  s: StudentProfileFields,
  competenciesCount: number,
): boolean {
  return Boolean(
    s.displayName &&
      s.pronouns &&
      s.introduction &&
      s.workMediaUrl &&
      competenciesCount > 0,
  );
}
