import './ModalHeader.css';

// The title row shared by every modal. Pass onClose to get a dismiss button;
// dialogs that are dismissed by their own buttons leave it off.
export default function ModalHeader({ title, onClose }) {
  return (
    <div className="modal-header">
      <h2>{title}</h2>
      {onClose && (
        <button
          type="button"
          className="modal-close"
          onClick={onClose}
          aria-label="Close"
        >
          ✕
        </button>
      )}
    </div>
  );
}
