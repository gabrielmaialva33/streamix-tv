import { activeElement, ElementNode, View } from "@lightningtv/solid";
import { useLocation, useNavigate } from "@solidjs/router";
import { createSignal, Show } from "solid-js";
import { ExitDialog, Sidebar } from "../components";

// Wrapper com sidebar + pageContainer.
//
// Fluxo de foco:
//  - Left no conteudo        -> foca sidebar (ultimo item focado preservado)
//  - Right na sidebar        -> volta pro ultimo item do conteudo (ou 1o da pagina)
//  - Backspace no conteudo   -> atalho pra sidebar (Samsung remote tem Backspace)
//  - Back na Home            -> dialog de sair
//  - Back em outras paginas  -> history.back()
//  - Menu                    -> navigate("/")
//
// Quando a rota muda, o pageContainer reforca foco no primeiro item focavel da
// nova pagina. Sem isso, ao navegar via sidebar o foco pode ficar la.
const MainLayout = (props: { children?: any }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [showExitDialog, setShowExitDialog] = createSignal(false);

  let sidebar: ElementNode | undefined;
  let pageContainer: ElementNode | undefined;
  let lastFocused: ElementNode | undefined;

  function focusSidebar() {
    if (sidebar?.states.has("$focus")) return false;
    lastFocused = activeElement();
    sidebar?.setFocus();
    return true;
  }

  function focusContent() {
    if (!sidebar?.states.has("$focus")) return false;
    const target = lastFocused && lastFocused !== sidebar ? lastFocused : pageContainer;
    target?.setFocus();
    return true;
  }

  function handleBack() {
    const p = location.pathname;
    const isHome = p === "/" || p === "";
    if (isHome) {
      setShowExitDialog(true);
      return true;
    }
    history.back();
    return true;
  }

  function exitApp() {
    const tizen = (window as any).tizen;
    if (tizen?.application) tizen.application.getCurrentApplication().exit();
    else setShowExitDialog(false);
  }

  // Focus flow: autofocus de cada pagina roda no mount. A Sidebar chama
  // onExit (focusContent) apos navegar, trazendo o foco pra pagina ativa.

  return (
    <View
      width={1920}
      height={1080}
      color={0x0d0d12ff}
      onLast={handleBack}
      onBack={handleBack}
      onBackspace={focusSidebar}
      onMenu={() => {
        navigate("/");
        return true;
      }}
      onLeft={focusSidebar}
      onRight={focusContent}
    >
      <Sidebar ref={sidebar} onExit={focusContent} />
      <View
        id="pageContainer"
        ref={pageContainer}
        x={220}
        width={1700}
        height={1080}
        clipping
        forwardFocus={0}
        children={props.children}
      />
      <Show when={showExitDialog()}>
        <ExitDialog onConfirm={exitApp} onCancel={() => setShowExitDialog(false)} />
      </Show>
    </View>
  );
};

export default MainLayout;
