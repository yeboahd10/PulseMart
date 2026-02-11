import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null, info: null }
  }

  componentDidCatch(error, info) {
    // Catch render errors in children
    this.setState({ error, info })
    // also log to console
    console.error('ErrorBoundary caught:', error, info)
  }

  render() {
    const { error, info } = this.state
    if (error) {
      return (
        <div style={{ padding: 24, fontFamily: 'system-ui, Arial', background: '#fff', color: '#111' }}>
          <h2 style={{ marginTop: 0 }}>An error occurred rendering the app</h2>
          <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: '#b91c1c' }}>{String(error && (error.message || error))}</div>
          {info?.componentStack && (
            <details style={{ marginTop: 12, background: '#f8fafc', padding: 12, borderRadius: 8 }}>
              <summary style={{ cursor: 'pointer' }}>Component stack</summary>
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{info.componentStack}</pre>
            </details>
          )}
        </div>
      )
    }

    return this.props.children
  }
}
