import Link from "next/link";
import { Check } from "lucide-react";
import { DiscoverButton } from "@/components/block/discover-button";

const programs = [
  ["Energy Bill Assistance", "LIHEAP"],
  ["Weatherization", "Home upgrades"],
  ["Community Solar", "Electric savings"],
];

export default function Home() {
  return (
    <main className="landing">
      <nav className="landnav">
        <Link href="/" className="logo">
          <span className="logo-mark">T</span> Threshold
        </Link>
        <div className="navright">
          <span>DC energy programs</span>
          <Link href="/app">
            Open the demo
          </Link>
        </div>
      </nav>
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="eyebrow-rule" /> Washington, DC
          </div>
          <h1>
            Check eligibility
            <br />
            <em>for six programs.</em>
          </h1>
          <p>
            Review household information, income limits, and program results in
            one place.
          </p>
          <div className="hero-actions">
            <DiscoverButton label="Open the demo" href="/app" />
            <span>No sign-in required</span>
          </div>
        </div>
        <div className="preview" aria-label="Example eligibility summary">
          <div className="preview-top">
            <span>Household</span>
            <span>HH-0042</span>
          </div>
          <div className="preview-person">
            <div className="avatar">JR</div>
            <div>
              <strong>Jordan Reed</strong>
              <small>2 people · Washington, DC</small>
            </div>
            <span className="preview-more">···</span>
          </div>
          <div className="preview-divider" />
          <div className="preview-title">
            <span>Program matches</span>
            <strong>4 of 6</strong>
          </div>
          <div className="preview-programs">
            {programs.map(([name, detail]) => (
              <div className="preview-row" key={name}>
                <div className="preview-check"><Check size={14} aria-hidden="true" /></div>
                <div>
                  <strong>{name}</strong>
                  <small>{detail}</small>
                </div>
                <span>Eligible</span>
              </div>
            ))}
          </div>
          <div className="preview-bottom">
            <span>Next step</span>
            <strong>Verify income and residency</strong>
          </div>
        </div>
      </section>
      <section className="landing-strip">
        <div>
          <strong>204</strong>
          <span>DC census tracts mapped</span>
        </div>
        <div>
          <strong>6</strong>
          <span>programs checked</span>
        </div>
        <div>
          <strong>1</strong>
          <span>household record</span>
        </div>
        <p>Program staff confirm every result before enrollment.</p>
      </section>
      <section className="landbody">
        <div>
          
          <h2>
            Check facts.
            <br />
            Review results.
          </h2>
        </div>
        <div className="feature-list">
          <article>
            <span>01</span>
            <div>
              <h3>Find a household</h3>
              <p>
                Search the queue and review its income, household size,
                benefits, and home conditions.
              </p>
            </div>
          </article>
          <article>
            <span>02</span>
            <div>
              <h3>Check the programs</h3>
              <p>
                See the result for each program, including the income limit
                used.
              </p>
            </div>
          </article>
          <article>
            <span>03</span>
            <div>
              <h3>Plan the work</h3>
              <p>
                Move eligible households through the enrollment stages and see
                which repairs come first.
              </p>
            </div>
          </article>
        </div>
      </section>
      <footer>
        <span>Threshold</span>
        <span>
          Independent prototype. Not affiliated with any agency, utility, or
          nonprofit named here. All household records are synthetic.
        </span>
        <Link href="/app">Open demo</Link>
      </footer>
    </main>
  );
}
