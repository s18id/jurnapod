// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { WebBootstrapContext } from "../bootstrap/web.js";
import { usePosAppState } from "../router/pos-app-state.js";
import { Container } from "../shared/components/Container.js";
import { Button } from "../shared/components/Button.js";
import { routes } from "../router/routes.js";

export interface ServiceModePageProps {
  context: WebBootstrapContext;
}

export function ServiceModePage({ context }: ServiceModePageProps): JSX.Element {
  const navigate = useNavigate();
  const {
    activeOrderContext,
    cartLines,
    setServiceType,
    clearCart,
    currentActiveOrderId
  } = usePosAppState();

  const hasActiveOrder = useMemo(() => {
    return cartLines.length > 0 || currentActiveOrderId !== null;
  }, [cartLines.length, currentActiveOrderId]);

  const handleTakeawayStart = () => {
    // Clear any existing cart and start fresh takeaway order
    clearCart();
    setServiceType("TAKEAWAY");
    navigate(routes.products.path);
  };

  const handleDineInStart = () => {
    // Clear any existing cart and navigate to tables page for selection
    clearCart();
    setServiceType("DINE_IN");
    navigate(routes.tables.path);
  };

  const handleResumeActive = () => {
    // Resume existing order - navigate to products to continue
    navigate(routes.products.path);
  };

  return (
    <Container maxWidth="full">
      <div className="service-mode-page">
        <div className="service-mode-header">
          <h1 className="service-mode-title">Select Service Mode</h1>
          <p className="service-mode-subtitle">
            Choose how you want to serve this customer
          </p>
        </div>

        <div className="service-mode-buttons">
          <button
            type="button"
            className="service-mode-button service-mode-button--takeaway"
            onClick={handleTakeawayStart}
          >
            <div className="service-mode-button-icon">🛍️</div>
            <div className="service-mode-button-label">Takeaway</div>
            <div className="service-mode-button-description">
              Quick order for pickup
            </div>
          </button>

          <button
            type="button"
            className="service-mode-button service-mode-button--dinein"
            onClick={handleDineInStart}
          >
            <div className="service-mode-button-icon">🍽️</div>
            <div className="service-mode-button-label">Dine-In</div>
            <div className="service-mode-button-description">
              Select table and serve
            </div>
          </button>

          {hasActiveOrder && (
            <button
              type="button"
              className="service-mode-button service-mode-button--resume"
              onClick={handleResumeActive}
            >
              <div className="service-mode-button-icon">📋</div>
              <div className="service-mode-button-label">Resume Active Order</div>
              <div className="service-mode-button-description">
                Continue current {activeOrderContext.service_type?.toLowerCase() || "order"}
              </div>
            </button>
          )}
        </div>

        <div className="service-mode-footer">
          <Button
            variant="secondary"
            onClick={() => navigate(routes.settings.path)}
          >
            Settings
          </Button>
        </div>
      </div>

      <style>{`
        .service-mode-page {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          padding: 2rem 1rem;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }

        .service-mode-header {
          text-align: center;
          margin-bottom: 3rem;
          color: white;
        }

        .service-mode-title {
          font-size: 2.5rem;
          font-weight: 700;
          margin-bottom: 0.5rem;
          text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .service-mode-subtitle {
          font-size: 1.125rem;
          opacity: 0.95;
          font-weight: 400;
        }

        .service-mode-buttons {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          width: 100%;
          max-width: 500px;
          margin-bottom: 2rem;
        }

        .service-mode-button {
          background: white;
          border: none;
          border-radius: 16px;
          padding: 2rem;
          min-height: 160px;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
        }

        .service-mode-button:hover {
          transform: translateY(-4px);
          box-shadow: 0 8px 12px rgba(0, 0, 0, 0.15);
        }

        .service-mode-button:active {
          transform: translateY(-2px);
        }

        .service-mode-button-icon {
          font-size: 4rem;
          margin-bottom: 1rem;
        }

        .service-mode-button-label {
          font-size: 1.75rem;
          font-weight: 600;
          color: #1a202c;
          margin-bottom: 0.5rem;
        }

        .service-mode-button-description {
          font-size: 1rem;
          color: #718096;
          font-weight: 400;
        }

        .service-mode-button--takeaway:hover {
          background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
        }

        .service-mode-button--dinein:hover {
          background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
        }

        .service-mode-button--resume {
          background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%);
        }

        .service-mode-button--resume:hover {
          background: linear-gradient(135deg, #a7f3d0 0%, #6ee7b7 100%);
        }

        .service-mode-footer {
          margin-top: 2rem;
        }

        @media (min-width: 640px) {
          .service-mode-buttons {
            flex-direction: row;
            flex-wrap: wrap;
            max-width: 800px;
          }

          .service-mode-button {
            flex: 1;
            min-width: 240px;
          }

          .service-mode-button--resume {
            flex-basis: 100%;
          }
        }

        @media (max-width: 639px) {
          .service-mode-title {
            font-size: 2rem;
          }

          .service-mode-button {
            min-height: 140px;
            padding: 1.5rem;
          }

          .service-mode-button-icon {
            font-size: 3rem;
          }

          .service-mode-button-label {
            font-size: 1.5rem;
          }
        }
      `}</style>
    </Container>
  );
}
