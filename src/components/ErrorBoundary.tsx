import { Component, type ErrorInfo, type ReactNode } from 'react';
import { clearPersistedState } from '../app/statePersistence';

interface Props {
  children: ReactNode;
}

interface State {
  error?: Error;
}

/**
 * Without this, any render-time throw unmounts the whole tree and leaves a blank white page with
 * no clue what happened — the worst possible failure mode for a game being played on someone
 * else's laptop. Shows the error instead, plus a way out that also drops the persisted match, in
 * case it's the restored state itself that can't be rendered.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = {};

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled error in app tree:', error, info.componentStack);
  }

  private startOver = () => {
    clearPersistedState();
    window.location.href = window.location.origin + window.location.pathname;
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="screen">
        <h1>Something broke</h1>
        <div className="card">
          <p className="error-banner">{error.message}</p>
          <p style={{ color: 'var(--text-muted)' }}>
            The full details are in the browser console. Starting over clears the saved match and
            returns to the home screen; both players will need to reconnect.
          </p>
          <button onClick={this.startOver}>Start over</button>
        </div>
      </div>
    );
  }
}
