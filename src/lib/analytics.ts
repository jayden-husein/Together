// Local analytics hook. Consumers may subscribe; payloads contain no identifiers or free text.
export function actionEvent(action:'sign_in'|'check_in'|'report'|'claim'|'resolve'|'post_update') {
 window.dispatchEvent(new CustomEvent('together:analytics',{detail:{action,at:new Date().toISOString()}}))
}
