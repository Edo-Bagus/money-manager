import { describe, expect, it, vi } from "vitest";
import {
  addDays,
  defaultCloseDate,
  isWibDate,
  toOccurredAt,
  todayWib,
  wibDate,
  wibDayRange,
  wibMonthRange,
} from "@/lib/date/wib";

describe("wibDate", () => {
  it("switches to the next date at 00:00 WIB, which is 17:00 UTC", () => {
    expect(wibDate(new Date("2026-10-15T16:59:59.999Z"))).toBe("2026-10-15");
    expect(wibDate(new Date("2026-10-15T17:00:00.000Z"))).toBe("2026-10-16");
  });

  it("accepts timestamptz strings as PostgREST returns them", () => {
    expect(wibDate("2026-10-15T17:30:00+00:00")).toBe("2026-10-16");
    expect(wibDate("2026-10-16T00:30:00+07:00")).toBe("2026-10-16");
    expect(wibDate("2026-12-31T17:00:00Z")).toBe("2027-01-01");
  });

  it("rejects an invalid instant", () => {
    expect(() => wibDate("not a date")).toThrow(RangeError);
    expect(() => wibDate(new Date(Number.NaN))).toThrow(RangeError);
  });
});

describe("todayWib", () => {
  it("is already tomorrow's date in WIB late in the UTC evening", () => {
    expect(todayWib(new Date("2026-10-15T23:30:00Z"))).toBe("2026-10-16");
    expect(todayWib(new Date("2026-10-15T01:00:00Z"))).toBe("2026-10-15");
  });
});

describe("isWibDate", () => {
  it("accepts real calendar dates only", () => {
    expect(isWibDate("2026-10-16")).toBe(true);
    expect(isWibDate("2028-02-29")).toBe(true);
    expect(isWibDate("2026-02-29")).toBe(false);
    expect(isWibDate("2026-02-30")).toBe(false);
    expect(isWibDate("2026-13-01")).toBe(false);
    expect(isWibDate("2026-1-5")).toBe(false);
    expect(isWibDate("20261016")).toBe(false);
    expect(isWibDate("2026-10-16T00:00:00Z")).toBe(false);
    expect(isWibDate("")).toBe(false);
  });
});

describe("addDays", () => {
  it.each([
    ["2026-10-16", 1, "2026-10-17"],
    ["2026-10-16", -1, "2026-10-15"],
    ["2026-10-16", 0, "2026-10-16"],
    ["2026-10-31", 1, "2026-11-01"],
    ["2026-12-31", 1, "2027-01-01"],
    ["2027-01-01", -1, "2026-12-31"],
    ["2028-02-28", 1, "2028-02-29"],
    ["2026-02-28", 1, "2026-03-01"],
    ["2026-10-16", 365, "2027-10-16"],
  ])("%s %+i days is %s", (date, days, expected) => {
    expect(addDays(date, days)).toBe(expected);
  });

  it("rejects an invalid date or a fractional day count", () => {
    expect(() => addDays("2026-02-30", 1)).toThrow(RangeError);
    expect(() => addDays("2026-10-16", 0.5)).toThrow(RangeError);
  });
});

describe("wibDayRange", () => {
  it("runs from 00:00 WIB to the next 00:00 WIB, in UTC", () => {
    expect(wibDayRange("2026-10-16")).toEqual({
      start: "2026-10-15T17:00:00.000Z",
      end: "2026-10-16T17:00:00.000Z",
    });
  });

  it("covers exactly the instants whose WIB date is that date", () => {
    const { start, end } = wibDayRange("2026-10-16");
    expect(wibDate(start)).toBe("2026-10-16");
    expect(wibDate(new Date(Date.parse(end) - 1))).toBe("2026-10-16");
    expect(wibDate(end)).toBe("2026-10-17");
  });

  it("rejects an invalid date", () => {
    expect(() => wibDayRange("2026-10-32")).toThrow(RangeError);
  });
});

describe("wibMonthRange", () => {
  it.each([
    ["2026-10", "2026-09-30T17:00:00.000Z", "2026-10-31T17:00:00.000Z"],
    ["2026-12", "2026-11-30T17:00:00.000Z", "2026-12-31T17:00:00.000Z"],
    ["2027-01", "2026-12-31T17:00:00.000Z", "2027-01-31T17:00:00.000Z"],
    ["2028-02", "2028-01-31T17:00:00.000Z", "2028-02-29T17:00:00.000Z"],
  ])("%s runs from %s to %s", (month, start, end) => {
    expect(wibMonthRange(month)).toEqual({ start, end });
  });

  it("puts the last WIB evening of the month in that month", () => {
    const { end } = wibMonthRange("2026-10");
    // 31 Oct 23:59:59 WIB belongs to October; 1 Nov 00:00 WIB does not.
    expect(Date.parse("2026-10-31T23:59:59+07:00")).toBeLessThan(Date.parse(end));
    expect(Date.parse("2026-11-01T00:00:00+07:00")).toBe(Date.parse(end));
  });

  it.each([["2026-13"], ["2026-00"], ["2026-1"], ["2026-10-01"], ["0026-01"], [""]])(
    "rejects %j",
    (month) => {
      expect(() => wibMonthRange(month)).toThrow(RangeError);
    },
  );
});

describe("toOccurredAt", () => {
  it("reads the date and time as WIB wall-clock time", () => {
    expect(toOccurredAt("2026-10-15", "10:17")).toBe("2026-10-15T03:17:00.000Z");
    expect(toOccurredAt("2026-10-15", "10:17:02")).toBe("2026-10-15T03:17:02.000Z");
    expect(toOccurredAt("2026-10-16", "00:30")).toBe("2026-10-15T17:30:00.000Z");
    expect(toOccurredAt("2026-10-16", "23:59:59")).toBe("2026-10-16T16:59:59.000Z");
  });

  it("lands on the same WIB date at every hour of the day", () => {
    for (let hour = 0; hour < 24; hour++) {
      const time = `${String(hour).padStart(2, "0")}:00`;
      expect(wibDate(toOccurredAt("2026-10-16", time))).toBe("2026-10-16");
    }
  });

  it.each([["24:00"], ["9:00"], ["10:60"], ["10:00:60"], ["10.00"], [""]])(
    "rejects the time %j",
    (time) => {
      expect(() => toOccurredAt("2026-10-16", time)).toThrow(RangeError);
    },
  );

  it("rejects an invalid date", () => {
    expect(() => toOccurredAt("2026-02-30", "10:00")).toThrow(RangeError);
  });
});

describe("defaultCloseDate", () => {
  const open = () => false;
  const closed = () => true;
  // Instants on 16 Oct 2026, written in WIB.
  const at = (time: string) => new Date(`2026-10-16T${time}+07:00`);

  it("is yesterday before 03:00 WIB while yesterday is still open", () => {
    expect(defaultCloseDate(at("00:00:00"), open)).toBe("2026-10-15");
    expect(defaultCloseDate(at("02:59:59"), open)).toBe("2026-10-15");
  });

  it("is today before 03:00 WIB once yesterday is closed", () => {
    expect(defaultCloseDate(at("01:30:00"), closed)).toBe("2026-10-16");
  });

  it("is today from 03:00 WIB on", () => {
    expect(defaultCloseDate(at("03:00:00"), open)).toBe("2026-10-16");
    expect(defaultCloseDate(at("21:00:00"), open)).toBe("2026-10-16");
    expect(defaultCloseDate(at("23:59:59"), open)).toBe("2026-10-16");
  });

  it("asks about yesterday's WIB date, not the UTC one", () => {
    const isClosed = vi.fn(() => false);
    // 18:30 UTC on the 15th is 01:30 WIB on the 16th.
    defaultCloseDate(new Date("2026-10-15T18:30:00Z"), isClosed);
    expect(isClosed).toHaveBeenCalledWith("2026-10-15");
  });

  it("works across a month boundary", () => {
    expect(defaultCloseDate(new Date("2026-11-01T01:00:00+07:00"), open)).toBe("2026-10-31");
  });
});

describe("time zone independence", () => {
  it("gives the same answers whatever the server's TZ is", () => {
    const run = () => [
      wibDate("2026-10-15T17:30:00Z"),
      addDays("2026-10-31", 1),
      wibDayRange("2026-10-16").start,
      wibMonthRange("2026-03").end,
      toOccurredAt("2026-10-16", "00:30"),
      defaultCloseDate(new Date("2026-10-15T18:30:00Z"), () => false),
    ];
    const expected = run();
    for (const tz of ["UTC", "America/Los_Angeles", "Pacific/Kiritimati", "Europe/London"]) {
      vi.stubEnv("TZ", tz);
      expect(run()).toEqual(expected);
    }
  });

  it("matches Intl's Asia/Jakarta, so a tzdata change fails this test", () => {
    const jakarta = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    });
    const viaIntl = (ms: number) => {
      const parts = Object.fromEntries(jakarta.formatToParts(ms).map((p) => [p.type, p.value]));
      return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
    };

    // Every 7h13m from 2024 to 2040: hits every hour of the day many times.
    const step = (7 * 60 + 13) * 60 * 1000;
    for (let ms = Date.UTC(2024, 0, 1); ms < Date.UTC(2040, 0, 1); ms += step) {
      const expected = viaIntl(ms);
      expect(wibDate(new Date(ms))).toBe(expected.date);
      // defaultCloseDate's 03:00 rule relies on the WIB hour being right too.
      const closeDate = defaultCloseDate(new Date(ms), () => false);
      expect(closeDate).toBe(expected.hour < 3 ? addDays(expected.date, -1) : expected.date);
    }
  });
});
