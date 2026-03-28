import { useState } from 'react'
import { AlignmentPanel } from './components/AlignmentPanel.jsx'
import { PostAlignmentPanel } from './components/PostAlignmentPanel.jsx'
import { QualityControlPanel } from './components/QualityControlPanel.jsx'
import { MENU_SECTIONS } from './menuSections.js'
import './App.css'

function App() {
  const [activeId, setActiveId] = useState(MENU_SECTIONS[0].id)
  const active = MENU_SECTIONS.find((s) => s.id === activeId) ?? MENU_SECTIONS[0]

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Pipeline steps">
        <header className="sidebar-header">
          <h1 className="app-title">NGS pipeline</h1>
          <p className="app-subtitle">Workflow steps</p>
        </header>
        <nav className="sidebar-nav">
          <ul className="nav-list">
            {MENU_SECTIONS.map((section) => {
              const isActive = section.id === activeId
              return (
                <li key={section.id}>
                  <button
                    type="button"
                    className={`nav-item${isActive ? ' nav-item--active' : ''}`}
                    onClick={() => setActiveId(section.id)}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    {section.label}
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>
      </aside>

      <main className="main-panel">
        <header className="main-header">
          <h2 className="main-title">{active.label}</h2>
        </header>
        <div className="main-body">
          {active.id === 'quality-control' ? (
            <QualityControlPanel />
          ) : active.id === 'alignment' ? (
            <AlignmentPanel />
          ) : active.id === 'post-alignment' ? (
            <PostAlignmentPanel />
          ) : (
            <p className="main-placeholder">
              Content and actions for this step will go here. Switch sections using the menu on the
              left.
            </p>
          )}
        </div>
      </main>
    </div>
  )
}

export default App
