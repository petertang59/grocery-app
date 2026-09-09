import { useState } from 'react';
import { supabase } from '../supabaseClient';
import CategoryManager from './CategoryManager';
import StoreManager from './StoreManager';
import './Settings.css';

// The two things worth managing outside the day-to-day lists. The cards are
// shells for now — the editing lives behind them, not here.
const SECTIONS = [
  {
    key: 'categories',
    title: 'Grocery Categories',
    description:
      'The groups your shopping list is sorted into, like Produce and Pantry.',
    ready: true,
    icon: (
      <>
        <path d="M3 7h18" />
        <path d="M3 12h18" />
        <path d="M3 17h18" />
      </>
    ),
  },
  {
    key: 'stores',
    title: 'Stores',
    description: 'The shops you buy from, and the tabs on your shopping list.',
    ready: true,
    icon: (
      <>
        <path d="M3 9h18l-1.5-5.5A1 1 0 0 0 18.5 3h-13a1 1 0 0 0-1 .5L3 9Z" />
        <path d="M4 9v11a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9" />
        <path d="M9 21v-6h6v6" />
      </>
    ),
  },
];

export default function Settings({ theme, onToggleTheme, email }) {
  const dark = theme === 'dark';
  const [openSection, setOpenSection] = useState(null);

  return (
    <div className="settings">
      <section className="settings-section">
        <div className="settings-header">
          <h2>Settings</h2>
        </div>

        <div className="page-content">
          <div className="settings-cards">
            {SECTIONS.map((section) => {
              // Sections without an editor yet stay inert rather than offering a
              // button that does nothing.
              const Card = section.ready ? 'button' : 'div';

              return (
              <Card
                type={section.ready ? 'button' : undefined}
                className="settings-card"
                key={section.key}
                onClick={
                  section.ready ? () => setOpenSection(section.key) : undefined
                }
              >
                <span className="settings-card-icon" aria-hidden="true">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    {section.icon}
                  </svg>
                </span>
                <div className="settings-card-body">
                  <h3>{section.title}</h3>
                  <p>{section.description}</p>
                </div>
                {section.ready && (
                  <svg
                    className="settings-card-chevron"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                )}
              </Card>
              );
            })}

            <div className="settings-card">
              <span className="settings-card-icon" aria-hidden="true">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </span>
              <div className="settings-card-body">
                <h3>Account</h3>
                <p>{email ? `Signed in as ${email}.` : 'Signed in.'}</p>
              </div>
              <button
                type="button"
                className="settings-card-action"
                onClick={() => supabase.auth.signOut()}
              >
                Sign out
              </button>
            </div>

            <div className="settings-card">
              <span className="settings-card-icon" aria-hidden="true">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {dark ? (
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                  ) : (
                    <>
                      <circle cx="12" cy="12" r="4" />
                      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
                    </>
                  )}
                </svg>
              </span>
              <div className="settings-card-body">
                <h3>Appearance</h3>
                <p>Currently using {dark ? 'dark' : 'light'} mode.</p>
              </div>
              <button
                type="button"
                className="settings-card-action"
                onClick={onToggleTheme}
              >
                {dark ? 'Switch to light' : 'Switch to dark'}
              </button>
            </div>
          </div>
        </div>
      </section>

      <CategoryManager
        open={openSection === 'categories'}
        onClose={() => setOpenSection(null)}
      />

      <StoreManager
        open={openSection === 'stores'}
        onClose={() => setOpenSection(null)}
      />
    </div>
  );
}
