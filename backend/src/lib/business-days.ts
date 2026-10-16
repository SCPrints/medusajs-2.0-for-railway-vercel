/**
 * Business-day maths in the studio's timezone (NSW). Weekends are skipped;
 * public holidays are not.
 *
 * ponytail: no holiday calendar — a reminder or due date can land a day early
 * around Christmas/Easter. Add an AU-NSW holiday list here if that bites.
 */
const STUDIO_TZ = "Australia/Sydney"

const ymdFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: STUDIO_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

/** Calendar date (YYYY-MM-DD) of an instant, as seen in the studio. */
export function studioDate(at: Date): string {
  return ymdFormatter.format(at)
}

// Calendar dates are walked as UTC midnights so DST never shifts a day.
const parseYmd = (ymd: string): Date => new Date(`${ymd}T00:00:00Z`)
const isWeekend = (d: Date): boolean => d.getUTCDay() === 0 || d.getUTCDay() === 6
const nextDay = (d: Date): Date => new Date(d.getTime() + 86_400_000)

export function isStudioWeekend(at: Date): boolean {
  return isWeekend(parseYmd(studioDate(at)))
}

/**
 * Weekdays that have started since `from`, counted up to and including the
 * day of `to`. Sent Monday → Wednesday is 2; sent Friday → Tuesday is 2.
 */
export function businessDaysBetween(from: Date, to: Date): number {
  const end = parseYmd(studioDate(to))
  let day = nextDay(parseYmd(studioDate(from)))
  let count = 0
  while (day.getTime() <= end.getTime()) {
    if (!isWeekend(day)) count += 1
    day = nextDay(day)
  }
  return count
}

/** The studio date `n` business days after `from`, as YYYY-MM-DD. */
export function addBusinessDays(from: Date, n: number): string {
  let day = parseYmd(studioDate(from))
  let added = 0
  while (added < n) {
    day = nextDay(day)
    if (!isWeekend(day)) added += 1
  }
  return day.toISOString().slice(0, 10)
}
