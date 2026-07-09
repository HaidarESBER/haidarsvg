// Lightweight, dependency-free toast notifications used instead of blocking
// window.alert() dialogs. Auto-dismisses and stacks in the bottom-right corner.

let container;

function ensureContainer() {
    if (container) return container;
    container = document.createElement('div');
    container.setAttribute('id', 'toast-container');
    Object.assign(container.style, {
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        zIndex: '10000',
        maxWidth: 'min(360px, 90vw)',
        pointerEvents: 'none',
    });
    document.body.appendChild(container);
    return container;
}

const COLORS = {
    info: '#2563eb',
    success: '#16a34a',
    error: '#dc2626',
};

/**
 * Show a transient toast message.
 * @param {string} message - Text to display.
 * @param {"info"|"success"|"error"} [type] - Severity; inferred from the
 *   message when omitted (messages mentioning error/failed render as errors).
 * @param {number} [durationMs] - How long before auto-dismiss.
 */
export function showToast(message, type, durationMs = 5000) {
    if (!type) {
        type = /error|failed|could not|cannot|unable/i.test(message) ? 'error' : 'info';
    }
    const el = document.createElement('div');
    el.textContent = message;
    el.setAttribute('role', 'status');
    Object.assign(el.style, {
        background: COLORS[type] || COLORS.info,
        color: '#fff',
        padding: '12px 16px',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
        fontSize: '14px',
        lineHeight: '1.4',
        whiteSpace: 'pre-line',
        pointerEvents: 'auto',
        cursor: 'pointer',
        transition: 'opacity 0.3s ease',
    });
    el.addEventListener('click', () => el.remove());
    ensureContainer().appendChild(el);
    setTimeout(() => {
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 300);
    }, durationMs);
}
