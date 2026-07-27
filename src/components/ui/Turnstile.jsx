import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";

// Widget do Cloudflare Turnstile (CAPTCHA exigido pelo Supabase Auth pra
// signUp/signInWithPassword/resetPasswordForEmail depois que ativamos
// "Attack Protection" no Dashboard). Script global carregado em public/index.html.
// Token é de uso único — chamar reset() depois de cada tentativa de submit.
const Turnstile = forwardRef(({ siteKey, onToken }, ref) => {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);

  useImperativeHandle(ref, () => ({
    reset: () => {
      if (widgetIdRef.current != null && window.turnstile) {
        window.turnstile.reset(widgetIdRef.current);
      }
    },
  }));

  useEffect(() => {
    let cancelado = false;
    let tentativas = 0;

    const tentarRenderizar = () => {
      if (cancelado) return;
      if (window.turnstile && containerRef.current) {
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: (token) => onToken(token),
          "expired-callback": () => onToken(""),
          "error-callback": () => onToken(""),
        });
        return;
      }
      // Script carrega async — tenta de novo por até ~5s.
      if (tentativas++ < 50) setTimeout(tentarRenderizar, 100);
    };
    tentarRenderizar();

    return () => {
      cancelado = true;
      if (widgetIdRef.current != null && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey]);

  return <div ref={containerRef} />;
});

export default Turnstile;
