import { useEffect } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { ArrowRightIcon, CalculatorIcon, CheckCircleIcon, ShieldCheckIcon, TrashBinMinimalisticIcon } from '@solar-icons/react/linear'
import logoOnLight from '../assets/brand/logo-dark.svg'
import logoOnDark from '../assets/brand/logo-light.svg'
import { STARTER_PALETTE } from '../compose/fallback.ts'
import ContrastBadge from '../components/ContrastBadge.tsx'
import { readableTextColour } from '../lib/colour.ts'
import { chatReply, COMPARE, DOES, FOOTER, HERO, NOT_YET, SIGN_IN_PATH, SIGN_UP_PATH, starterContrast, TRUST } from '../lib/landing.ts'
import { tasks } from '../lib/tasks.ts'
import { useAuth } from '../store/auth.ts'
import './Landing.css'

// The front door, at `/`, open to everyone. It says what Droplet is, shows the idea next to a chat reply, lists what exists today, what is
// kept in the founder's hands and who it is not for yet, then leads to making an account. A founder who is already signed in goes straight
// on to the app, and nothing is drawn while the session is looked for, so they never see this flash by.

const TRUST_ICONS = [CheckCircleIcon, CalculatorIcon, ShieldCheckIcon, TrashBinMinimalisticIcon]

const taskIcon = (id: string) => tasks.find((task) => task.id === id)!.icon

export default function Landing() {
  const status = useAuth((state) => state.status)
  const start = useAuth((state) => state.start)
  useEffect(() => start(), [start])

  if (status === 'loading') return <div className="auth-loading" role="status" aria-label="Loading" />
  if (status === 'signedIn') return <Navigate to="/home" replace />

  const { ratio, level } = starterContrast()

  return (
    <div className="landing">
      <div className="landing__screen">
        <header className="landing__header">
          <Link className="landing__logo" to="/" aria-label="Droplet">
            <img className="landing__logo-img landing__logo-img--on-light" src={logoOnLight} alt="" />
            <img className="landing__logo-img landing__logo-img--on-dark" src={logoOnDark} alt="" />
          </Link>
          <Link className="landing__signin" to={SIGN_IN_PATH}>
            Sign in
          </Link>
        </header>

        <main className="landing__main">
          <section className="landing__hero" aria-labelledby="landing-title">
            <h1 id="landing-title" className="landing__title">
              {HERO.title}
            </h1>
            <p className="landing__lead">{HERO.lead}</p>
            <div className="landing__actions">
              <Link className="landing__button landing__button--primary" to={SIGN_UP_PATH}>
                {HERO.primary}
                <ArrowRightIcon size={18} aria-hidden="true" />
              </Link>
              <Link className="landing__button landing__button--quiet" to={SIGN_IN_PATH}>
                {HERO.secondary}
              </Link>
            </div>
          </section>

          <section className="landing__section" aria-labelledby="landing-compare">
            <h2 id="landing-compare" className="landing__heading">
              {COMPARE.title}
            </h2>
            <div className="landing__compare">
              <article className="landing__side">
                <h3>{COMPARE.chat.label}</h3>
                <p>{COMPARE.chat.text}</p>
                {/* The pictures are decoration: the words above say what they show. */}
                <div className="landing__picture landing__picture--chat" aria-hidden="true">
                  <p>{chatReply()}</p>
                </div>
              </article>
              <article className="landing__side">
                <h3>{COMPARE.droplet.label}</h3>
                <p>{COMPARE.droplet.text}</p>
                <div className="landing__picture landing__picture--droplet" aria-hidden="true">
                  <div className="landing__swatches">
                    {STARTER_PALETTE.map((colour) => (
                      <span className="landing__swatch" key={colour.hex} style={{ background: colour.hex, color: readableTextColour(colour.hex) }}>
                        {colour.hex.toUpperCase()}
                      </span>
                    ))}
                  </div>
                  <div className="landing__readout">
                    <span>Text on background</span>
                    <ContrastBadge ratio={ratio} level={level} />
                  </div>
                </div>
              </article>
            </div>
          </section>

          <section className="landing__section" aria-labelledby="landing-does">
            <h2 id="landing-does" className="landing__heading">
              {DOES.title}
            </h2>
            <ul className="landing__list landing__list--cards">
              {DOES.live.map((item) => {
                const ItemIcon = taskIcon(item.id)
                return (
                  <li className="landing__card" key={item.id}>
                    <span className="landing__icon">
                      <ItemIcon size={22} aria-hidden="true" />
                    </span>
                    <h3>{item.title}</h3>
                    <p>{item.text}</p>
                  </li>
                )
              })}
            </ul>
            <ul className="landing__next" aria-label="Planned">
              {DOES.next.map((item) => {
                const ItemIcon = taskIcon(item.id)
                return (
                  <li key={item.id}>
                    <ItemIcon size={18} aria-hidden="true" />
                    {item.title}
                    <em>{DOES.nextLabel}</em>
                  </li>
                )
              })}
            </ul>
          </section>

          <section className="landing__section" aria-labelledby="landing-trust">
            <h2 id="landing-trust" className="landing__heading">
              {TRUST.title}
            </h2>
            <ul className="landing__list landing__list--points">
              {TRUST.points.map((point, position) => {
                const PointIcon = TRUST_ICONS[position % TRUST_ICONS.length]
                return (
                  <li key={point}>
                    <span className="landing__icon landing__icon--small">
                      <PointIcon size={20} aria-hidden="true" />
                    </span>
                    {point}
                  </li>
                )
              })}
            </ul>
          </section>

          <section className="landing__section" aria-labelledby="landing-not">
            <h2 id="landing-not" className="landing__heading">
              {NOT_YET.title}
            </h2>
            <p className="landing__note">{NOT_YET.lead}</p>
            <ul className="landing__plain">
              {NOT_YET.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </section>
        </main>

        <footer className="landing__footer">
          <p>{FOOTER}</p>
        </footer>
      </div>
    </div>
  )
}
