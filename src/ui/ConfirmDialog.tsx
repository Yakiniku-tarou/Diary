import { useEffect, useRef } from "react";

interface Props {
  open: boolean;
  message: string;
  detail?: string;
  confirmLabel: string;
  /** 取り消せない操作（削除）は赤いボタンにする */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** 確認ダイアログ（ホーム画面アプリでも確実に出るよう、window.confirm は使わない） */
export function ConfirmDialog({ open, message, detail, confirmLabel, danger, onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="dialog"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
    >
      <p className="dialog-message">{message}</p>
      {detail && <p className="dialog-detail">{detail}</p>}
      <div className="dialog-actions">
        <button type="button" className="button secondary" onClick={onCancel}>
          やめる
        </button>
        <button type="button" className={danger ? "button danger" : "button primary"} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
