"use client";

export type DocKind = "pay_stub" | "utility_bill" | "benefit_letter";

const firsts = ["Avery", "Jordan", "Morgan", "Taylor", "Casey", "Riley", "Quinn", "Alex", "Jamie", "Imani", "Tesfaye", "Lucia"];
const lasts = ["Cole", "Reed", "Brooks", "Hayes", "Price", "Turner", "Bennett", "Parker", "Diaz", "Rivera", "Kim", "Abebe"];
const streets = ["Benning Rd NE", "Alabama Ave SE", "Georgia Ave NW", "Rhode Island Ave NE", "Minnesota Ave SE", "Kennedy St NW", "H St NE", "Martin Luther King Jr Ave SE"];
const zips = ["20001", "20002", "20003", "20010", "20011", "20019", "20020", "20032"];
const employers = ["Anacostia Greenworks LLC", "Riverside Care Partners", "Capitol Row Grocers", "Eastside Transit Services"];
const pick = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)];
const usd = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const payPeriods: Record<string, string> = {
  Weekly: "10/19/2026 – 10/25/2026",
  Biweekly: "10/12/2026 – 10/25/2026",
  Semimonthly: "10/01/2026 – 10/15/2026",
  Monthly: "10/01/2026 – 10/31/2026",
};

/** Draws a clearly fictional household document on a canvas and returns it as a PNG data URL. */
export function makeSyntheticDocument(kind: DocKind) {
  const canvas = document.createElement("canvas");
  canvas.width = 850;
  canvas.height = 1100;
  const ctx = canvas.getContext("2d")!;
  const name = `${pick(firsts)} ${pick(lasts)}`;
  const address = `${100 + Math.floor(Math.random() * 4800)} ${pick(streets)}`;
  const zip = pick(zips);
  let y = 90;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const text = (value: string, size = 20, weight = "400", x = 70, color = "#1c1c1c") => {
    ctx.font = `${weight} ${size}px Helvetica, Arial, sans-serif`;
    ctx.fillStyle = color;
    ctx.fillText(value, x, y);
  };
  const row = (label: string, value: string) => {
    text(label, 18, "400", 70, "#555");
    text(value, 20, "600", 380);
    y += 42;
  };
  const rule = () => {
    ctx.fillStyle = "#d4d4d4";
    ctx.fillRect(70, y - 18, 710, 2);
    y += 24;
  };

  if (kind === "pay_stub") {
    const employer = pick(employers);
    const frequency = pick(["Biweekly", "Weekly", "Semimonthly", "Monthly"]);
    const perPeriod = { Weekly: 52, Biweekly: 26, Semimonthly: 24, Monthly: 12 }[frequency]!;
    const annual = 18000 + Math.round(Math.random() * 62000);
    const gross = Math.round((annual / perPeriod) * 100) / 100;
    text(employer.toUpperCase(), 30, "700"); y += 36;
    text("Earnings statement", 20, "400", 70, "#555"); y += 50; rule();
    row("Employee", name);
    row("Address", `${address}, Washington, DC ${zip}`);
    row("Pay frequency", frequency);
    row("Pay period", payPeriods[frequency]);
    rule();
    row("Gross pay this period", usd(gross));
    row("Federal tax", usd(Math.round(gross * 0.08 * 100) / 100));
    row("Net pay", usd(Math.round(gross * 0.86 * 100) / 100));
  } else if (kind === "utility_bill") {
    const kwh = 380 + Math.floor(Math.random() * 700);
    text("CAPITOL LIGHT & POWER", 32, "700", 70, "#14532d"); y += 34;
    text("Residential electric statement (fictional utility)", 18, "400", 70, "#555"); y += 50; rule();
    row("Customer", name);
    row("Service address", address);
    row("City", `Washington, DC ${zip}`);
    row("Account number", `CLP-${Math.floor(1e7 + Math.random() * 9e7)}`);
    row("Billing period", "Sep 28 – Oct 27, 2026");
    rule();
    row("Electricity used", `${kwh} kWh`);
    row("Amount due", usd(Math.round(kwh * 0.19 * 100) / 100));
  } else {
    const program = pick(["SNAP", "SSI", "TANF"]);
    const size = 1 + Math.floor(Math.random() * 5);
    text("DISTRICT BENEFITS OFFICE", 30, "700", 70, "#1e3a8a"); y += 34;
    text("Notice of approval (fictional agency)", 18, "400", 70, "#555"); y += 50; rule();
    row("Recipient", name);
    row("Address", `${address}, Washington, DC ${zip}`);
    row("Program", program);
    row("Household size", String(size));
    row("Monthly benefit", usd(150 + Math.floor(Math.random() * 900)));
    row("Effective date", "11/01/2026");
  }

  ctx.save();
  ctx.translate(425, 700);
  ctx.rotate(-Math.PI / 6);
  ctx.font = "700 64px Helvetica, Arial, sans-serif";
  ctx.fillStyle = "rgba(220, 38, 38, 0.13)";
  ctx.textAlign = "center";
  ctx.fillText("SAMPLE — SYNTHETIC", 0, 0);
  ctx.restore();

  return canvas.toDataURL("image/png");
}
