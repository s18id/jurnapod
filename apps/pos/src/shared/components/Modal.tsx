// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React from "react";
import {
  IonButton,
  IonContent,
  IonHeader,
  IonModal,
  IonTitle,
  IonToolbar
} from "@ionic/react";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  titleId?: string;
  children: React.ReactNode;
  showCloseButton?: boolean;
}

export function Modal({
  isOpen,
  onClose,
  title,
  titleId,
  children,
  showCloseButton = true
}: ModalProps): JSX.Element {
  return (
    <IonModal isOpen={isOpen} onDidDismiss={onClose}>
      {(title || showCloseButton) && (
        <IonHeader>
          <IonToolbar>
            {title ? <IonTitle id={titleId}>{title}</IonTitle> : <IonTitle />}
            {showCloseButton ? (
              <IonButton slot="end" fill="clear" onClick={onClose} aria-label="Close">
                ×
              </IonButton>
            ) : null}
          </IonToolbar>
        </IonHeader>
      )}
      <IonContent className="ion-padding">{children}</IonContent>
    </IonModal>
  );
}
