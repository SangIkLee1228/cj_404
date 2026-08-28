import styles from '../../pos.module.css';
import TrayRecognition from '../ai-capture/TrayRecognition';
import CartList from '../cart/CartList';
import MembershipPanel from '../membership/MembershipPanel';
import PaymentArea from '../payment/PaymentArea';
import ProductCatalog from '../product-catalog/ProductCatalog';
import CaptureControls from '../ai-capture/CaptureControls';

export default function RecognitionScreen({
  pos,
  onRequestRetake,
  onRequestCancel,
  onRequestPayment,
}) {
  const { state, activeCart, totalCount, totalAmount, points, memberName } =
    pos;

  return (
    <main className={styles.recognitionMain}>
      <section className={styles.middle}>
        <TrayRecognition
          hasCaptured={state.capture.hasCaptured}
          isShooting={pos.isShooting}
          scan={pos.scanResult}
        />
        <CartList
          items={activeCart}
          remainingOf={pos.remainingOf}
          onChangeQty={pos.changeQty}
          onDelete={pos.removeItem}
        />
        <div className={styles.bottomActions}>
          {state.payment.failed && (
            <div className={styles.paymentFailBanner}>
              <span>
                결제가 승인되지 않았습니다. 다시 시도하거나 계산을 취소하세요.
              </span>
              <div className={styles.paymentFailActions}>
                <button type="button" onClick={pos.pay}>
                  재결제
                </button>
                <button type="button" onClick={onRequestCancel}>
                  계산 취소
                </button>
              </div>
            </div>
          )}
          <MembershipPanel
            cartEmpty={activeCart.length === 0}
            paid={state.payment.paid}
            memberConfirmed={state.membership.memberConfirmed}
            memberName={memberName}
            points={points}
            onOpenMembership={pos.openMembership}
            onCancelOrder={onRequestCancel}
          />
          <PaymentArea
            totalCount={totalCount}
            totalAmount={totalAmount}
            paid={state.payment.paid}
            cartEmpty={activeCart.length === 0}
            onPay={onRequestPayment}
            onNewOrder={pos.newOrder}
          />
        </div>
      </section>

      <aside className={styles.rightPane}>
        <ProductCatalog
          productType={state.catalogFilter.productType}
          category={state.catalogFilter.category}
          products={pos.products}
          remainingOf={pos.remainingOf}
          onSetType={pos.setCatalogType}
          onSetCategory={pos.setCatalogCategory}
          onAdd={pos.manualAdd}
        />
        <CaptureControls
          hasCaptured={state.capture.hasCaptured}
          paid={state.payment.paid}
          onRetake={onRequestRetake}
          onAdd={() => pos.openCaptureScreen('add')}
          onBasic={() => pos.openCaptureScreen('basic')}
        />
      </aside>
    </main>
  );
}
