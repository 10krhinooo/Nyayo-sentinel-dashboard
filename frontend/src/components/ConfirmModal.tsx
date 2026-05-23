"use client";

import { useEffect, useRef } from "react";

interface ConfirmModalProps {
  title: string;
  body: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}

export function ConfirmModal({ title, body, confirmLabel = "Confirm", onConfirm, onCancel, danger = false }: ConfirmModalProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <>
      <div className="modal-backdrop" onClick={onCancel} />
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <h2 className="modal-title" id="modal-title">{title}</h2>
        <p className="modal-body">{body}</p>
        <div className="modal-actions">
          <button ref={cancelRef} className="btn-secondary" onClick={onCancel}>Cancel</button>
          <button
            className={danger ? "btn-danger" : "btn-primary"}
            onClick={() => { onConfirm(); }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
}
