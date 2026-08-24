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
}) {
  const { state, activeCart, totalCount, totalAmount, points, memberName } =
    pos;
  const aiItems = activeCart.filter(
    (item) => item.source === 'ai' || item.source === 'mixed'
  );

  return (
    <main className={styles.recognitionMain}>
      <section className={styles.middle}>
        <TrayRecognition
          hasCaptured={state.capture.hasCaptured}
          aiItems={aiItems}
        />
        <CartList
          items={activeCart}
          remainingOf={pos.remainingOf}
          onChangeQty={pos.changeQty}
        />
        <div className={styles.bottomActions}>
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
            onPay={pos.pay}
            onNewOrder={pos.newOrder}
          />
        </div>
      </section>

      <aside className={styles.rightPane}>
        <ProductCatalog
          productType={state.catalogFilter.productType}
          category={state.catalogFilter.category}
          managerState={state.managerState}
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
