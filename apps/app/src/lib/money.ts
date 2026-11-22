// المبالغ بالهللة كأرقام صحيحة. الدوال نفسها في packages/shared، عشان الخادم والتطبيق
// يحسبون الضريبة بنفس الطريقة بالضبط.
export { assertHalalas, riyals, vatOf, VAT_RATE_BASIS_POINTS, withVat } from "@mazood/shared";
