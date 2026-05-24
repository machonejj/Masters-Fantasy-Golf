'use client';

// Shared "↻ Live" control + last-refreshed time, used as the PageHeader action on
// every tab that shows live ESPN data (Standings, The Field, Live Feed). Click to
// refresh now; the time shows when the data last came from ESPN.
export default function LiveStatus({ status, updatedAt, onRefresh }) {
  const loading = status === 'loading';
  return (
    <div className="text-right">
      <button
        onClick={onRefresh}
        disabled={loading}
        className="btn-outline btn-sm"
        title="Refresh live scores from ESPN"
      >
        {loading ? 'Refreshing…' : '↻ Live'}
      </button>
      {status === 'error' ? (
        <div className="text-[10px] text-score-over mt-1">live feed unavailable</div>
      ) : updatedAt ? (
        <div className="text-[10px] text-gray-400 mt-1">
          ESPN · {new Date(updatedAt).toLocaleTimeString()}
        </div>
      ) : null}
    </div>
  );
}
