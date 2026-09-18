import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('[UI] Erro não tratado:', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main style={{ minHeight: '100vh', background: '#08090C', color: '#F1F5F9', display: 'grid', placeItems: 'center', padding: 24 }}>
        <section style={{ maxWidth: 460, padding: 28, borderRadius: 14, background: '#0F1117', border: '1px solid rgba(255,255,255,0.08)', textAlign: 'center' }}>
          <h1 style={{ margin: '0 0 8px', fontSize: 20 }}>O CRM encontrou um erro</h1>
          <p style={{ margin: '0 0 20px', color: '#94A3B8', fontSize: 14 }}>
            Seus dados continuam salvos. Recarregue a interface para continuar.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{ border: 0, borderRadius: 8, padding: '10px 18px', background: '#6366F1', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
          >
            Recarregar CRM
          </button>
        </section>
      </main>
    );
  }
}
