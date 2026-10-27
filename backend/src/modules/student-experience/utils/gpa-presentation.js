export function presentGpaSummary(summary) {
  if (!summary || summary.status === 'STALE' || summary.status === 'FAILED' || !Number(summary.credits)) {
    return {
      available: false,
      gpa: null,
      cgpa: null,
      credits: 0,
      classification: null,
      status: summary?.status || 'UNAVAILABLE',
      engine: summary?.engine || null,
      calculationVersion: summary?.calculationVersion || null,
      calculatedAt: summary?.calculatedAt || null,
      semesters: [],
      excluded: summary?.excluded || [],
    };
  }
  return {
    available: true,
    gpa: summary.gpa,
    cgpa: summary.cgpa,
    credits: summary.credits,
    classification: summary.classification || null,
    status: summary.status,
    engine: summary.engine,
    calculationVersion: summary.calculationVersion || null,
    calculatedAt: summary.calculatedAt || null,
    semesters: summary.semesters || [],
    excluded: summary.excluded || [],
  };
}
