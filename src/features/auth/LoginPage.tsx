import { type IntrinsicNodeStyleProps, Text, View } from "@lightningtv/solid";
import { Column, Row } from "@lightningtv/solid/primitives";
import { useNavigate } from "@solidjs/router";
import { createEffect, createMemo, createSignal, For, onMount, Show } from "solid-js";
import { authState, initializeAuth, registerAccount, signIn } from "./auth";
import { SCREEN_HEIGHT, SCREEN_WIDTH } from "@/shared/layout";
import { theme } from "@/styles";

type FieldName = "email" | "password" | "name";
type KeyboardMode = "lower" | "upper" | "symbols";
type AuthMode = "login" | "register";

const INPUT_STYLE = {
  width: 620,
  height: 84,
  borderRadius: 18,
  color: theme.surface,
  border: { color: theme.border, width: 2 },
} satisfies IntrinsicNodeStyleProps;

const ACTIVE_INPUT_STYLE = {
  ...INPUT_STYLE,
  color: theme.surfaceLight,
  border: { color: theme.primary, width: 2 },
} satisfies IntrinsicNodeStyleProps;

const KEY_STYLE = {
  height: 62,
  borderRadius: 14,
  color: theme.surface,
  border: { color: theme.border, width: 1 },
  $focus: {
    color: theme.surfaceHover,
    border: { color: theme.primary, width: 2 },
  },
} satisfies IntrinsicNodeStyleProps;

const PRIMARY_ACTION_STYLE = {
  width: 300,
  height: 64,
  borderRadius: 18,
  color: theme.primary,
  $focus: {
    color: theme.primaryLight,
  },
} satisfies IntrinsicNodeStyleProps;

const SECONDARY_ACTION_STYLE = {
  width: 300,
  height: 64,
  borderRadius: 18,
  color: theme.surfaceLight,
  border: { color: theme.borderLight, width: 2 },
  $focus: {
    border: { color: theme.primary, width: 2 },
    color: theme.surfaceHover,
  },
} satisfies IntrinsicNodeStyleProps;

const MODE_CHIP_STYLE = {
  width: 150,
  height: 42,
  borderRadius: 21,
  color: theme.surface,
  border: { color: theme.border, width: 1 },
  $focus: {
    border: { color: theme.primary, width: 2 },
    color: theme.surfaceHover,
  },
} satisfies IntrinsicNodeStyleProps;

const ACTIVE_MODE_CHIP_STYLE = {
  ...MODE_CHIP_STYLE,
  color: 0x2b1015ff,
  border: { color: theme.primary, width: 1 },
} satisfies IntrinsicNodeStyleProps;

const FORM_PANEL_STYLE = {
  width: 680,
  height: 508,
  color: theme.backgroundLight,
  borderRadius: 28,
  border: { color: theme.border, width: 1 },
} satisfies IntrinsicNodeStyleProps;

const INFO_CARD_STYLE = {
  width: 205,
  height: 56,
  color: theme.surface,
  borderRadius: 16,
  border: { color: theme.border, width: 1 },
} satisfies IntrinsicNodeStyleProps;

const KEYBOARD_LAYOUT: Record<KeyboardMode, string[][]> = {
  lower: [
    ["1", "2", "3", "4", "5", "6", "7", "8"],
    ["9", "0", "@", ".", "_", "-", "DEL", "NEXT"],
    ["q", "w", "e", "r", "t", "y", "u", "i"],
    ["o", "p", "a", "s", "d", "f", "g", "h"],
    ["j", "k", "l", "z", "x", "c", "v", "b"],
    ["n", "m", "SPACE", "SHIFT", "123", "CLEAR", "OK"],
  ],
  upper: [
    ["1", "2", "3", "4", "5", "6", "7", "8"],
    ["9", "0", "@", ".", "_", "-", "DEL", "NEXT"],
    ["Q", "W", "E", "R", "T", "Y", "U", "I"],
    ["O", "P", "A", "S", "D", "F", "G", "H"],
    ["J", "K", "L", "Z", "X", "C", "V", "B"],
    ["N", "M", "SPACE", "SHIFT", "123", "CLEAR", "OK"],
  ],
  symbols: [
    ["1", "2", "3", "4", "5", "6", "7", "8"],
    ["9", "0", "@", ".", "_", "-", "/", ":"],
    ["!", "?", "#", "$", "%", "&", "*", "+"],
    ["=", "~", "^", "(", ")", "[", "]", "{"],
    ["}", "|", ";", ",", "'", '"', "<", ">"],
    ["abc", "SPACE", "DEL", "CLEAR", "NEXT", "OK"],
  ],
};

const FIELD_ORDER: FieldName[] = ["email", "password", "name"];

function maskPassword(value: string) {
  return value.length > 0 ? "•".repeat(value.length) : "Use o teclado para digitar sua senha";
}

function authModeLabel(mode: AuthMode) {
  return mode === "login" ? "Entrar" : "Criar conta";
}

const LoginPage = () => {
  const navigate = useNavigate();
  const [mode, setMode] = createSignal<AuthMode>("login");
  const [keyboardMode, setKeyboardMode] = createSignal<KeyboardMode>("lower");
  const [activeField, setActiveField] = createSignal<FieldName>("email");
  const [form, setForm] = createSignal({ email: "", password: "", name: "" });
  const [submitting, setSubmitting] = createSignal(false);
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null);

  onMount(() => {
    void initializeAuth();
  });

  const activeFields = createMemo<FieldName[]>(() =>
    mode() === "register" ? FIELD_ORDER : FIELD_ORDER.filter(field => field !== "name"),
  );

  const activeLayout = createMemo(() => KEYBOARD_LAYOUT[keyboardMode()]);
  const titleCopy = createMemo(() => (mode() === "login" ? "Entre na sua conta" : "Crie sua conta"));
  const descriptionCopy = createMemo(() =>
    mode() === "login"
      ? "Sincronize favoritos, retome a reprodução e deixe o Streamix com a sua cara."
      : "Crie sua conta diretamente na TV para salvar favoritos, progresso e preferências pessoais.",
  );
  const highlights = createMemo(() =>
    mode() === "login"
      ? ["Favoritos sincronizados", "Continue assistindo", "Experiência personalizada"]
      : ["Cadastro rápido na TV", "Sincronização imediata", "Seu progresso salvo"],
  );
  createEffect(() => {
    if (authState.isAuthenticated()) {
      navigate("/", { replace: true });
    }
  });

  function cycleField() {
    const fields = activeFields();
    const currentIndex = fields.indexOf(activeField());
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % fields.length : 0;
    setActiveField(fields[nextIndex]);
  }

  function updateField(nextValue: string) {
    const field = activeField();
    setForm(current => ({ ...current, [field]: nextValue }));
  }

  function handleKeyPress(key: string) {
    if (submitting()) {
      return;
    }

    if (key === "DEL") {
      updateField(form()[activeField()].slice(0, -1));
      return;
    }

    if (key === "CLEAR") {
      updateField("");
      return;
    }

    if (key === "SPACE") {
      updateField(form()[activeField()] + " ");
      return;
    }

    if (key === "NEXT") {
      cycleField();
      return;
    }

    if (key === "SHIFT") {
      setKeyboardMode(current => (current === "lower" ? "upper" : "lower"));
      return;
    }

    if (key === "123") {
      setKeyboardMode("symbols");
      return;
    }

    if (key === "abc") {
      setKeyboardMode("lower");
      return;
    }

    if (key === "OK") {
      void submit();
      return;
    }

    updateField(form()[activeField()] + key);
  }

  async function submit() {
    const values = form();
    setErrorMessage(null);

    if (!values.email.trim() || !values.password.trim()) {
      setErrorMessage("Preencha e-mail e senha para continuar.");
      return;
    }

    if (mode() === "register" && !values.name.trim()) {
      setErrorMessage("Informe seu nome para criar a conta.");
      setActiveField("name");
      return;
    }

    setSubmitting(true);

    try {
      if (mode() === "register") {
        await registerAccount(values.name.trim(), values.email.trim(), values.password);
      } else {
        await signIn(values.email.trim(), values.password);
      }
      navigate("/", { replace: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao autenticar.";
      setErrorMessage(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View width={SCREEN_WIDTH} height={SCREEN_HEIGHT} color={theme.background} forwardFocus={1}>
      <View x={96} y={88} width={700} height={904}>
        <Text fontSize={28} fontWeight={700} color={theme.primary}>
          STREAMIX
        </Text>

        <Row y={58} width={320} height={44} gap={12} scroll="none">
          <View
            style={mode() === "login" ? ACTIVE_MODE_CHIP_STYLE : MODE_CHIP_STYLE}
            onEnter={() => {
              setMode("login");
              setActiveField("email");
              setErrorMessage(null);
            }}
          >
            <Text x={48} y={11} fontSize={18} fontWeight={700} color={0xffffffff}>
              Entrar
            </Text>
          </View>
          <View
            style={mode() === "register" ? ACTIVE_MODE_CHIP_STYLE : MODE_CHIP_STYLE}
            onEnter={() => {
              setMode("register");
              setActiveField("email");
              setErrorMessage(null);
            }}
          >
            <Text x={24} y={11} fontSize={18} fontWeight={700} color={0xffffffff}>
              Criar conta
            </Text>
          </View>
        </Row>

        <Text y={126} fontSize={58} fontWeight={700} color={0xffffffff}>
          {titleCopy()}
        </Text>
        <Text y={206} width={620} fontSize={22} color={theme.textSecondary} maxLines={2} contain="width">
          {descriptionCopy()}
        </Text>

        <Row y={274} width={640} height={56} gap={12} scroll="none" skipFocus>
          <For each={highlights()}>
            {item => (
              <View style={INFO_CARD_STYLE}>
                <Text
                  y={18}
                  width={205}
                  fontSize={16}
                  color={theme.textPrimary}
                  textAlign="center"
                  maxLines={1}
                >
                  {item}
                </Text>
              </View>
            )}
          </For>
        </Row>

        <View y={354} style={FORM_PANEL_STYLE}>
          <Column x={20} y={20} width={640} gap={18} scroll="none" skipFocus>
            <FieldCard
              label="E-mail"
              value={form().email || "Use o teclado para digitar seu e-mail"}
              active={activeField() === "email"}
              onSelect={() => setActiveField("email")}
            />
            <FieldCard
              label="Senha"
              value={maskPassword(form().password)}
              active={activeField() === "password"}
              onSelect={() => setActiveField("password")}
            />
            <Show when={mode() === "register"}>
              <FieldCard
                label="Nome"
                value={form().name || "Use o teclado para digitar o seu nome"}
                active={activeField() === "name"}
                onSelect={() => setActiveField("name")}
              />
            </Show>
          </Column>

          <View
            x={20}
            y={mode() === "register" ? 306 : 212}
            width={640}
            height={44}
            color={0x00000000}
            skipFocus
          >
            <Text fontSize={16} color={theme.textMuted}>
              Use OK para digitar, PRÓX para trocar de campo e APAG para corrigir.
            </Text>
          </View>

          <Show when={errorMessage()}>
            <View
              x={20}
              y={mode() === "register" ? 350 : 256}
              width={640}
              color={0x3a1518ff}
              borderRadius={14}
              padding={18}
            >
              <Text width={604} fontSize={18} color={0xffa8a8ff} contain="width" maxLines={3}>
                {errorMessage() || ""}
              </Text>
            </View>
          </Show>

          <Row x={20} y={mode() === "register" ? 424 : 350} width={640} gap={20} scroll="none">
            <View style={PRIMARY_ACTION_STYLE} onEnter={() => void submit()}>
              <Text y={20} width={300} fontSize={22} fontWeight={700} color={0xffffffff} textAlign="center">
                {submitting() ? "Aguarde..." : authModeLabel(mode())}
              </Text>
            </View>
            <View
              style={SECONDARY_ACTION_STYLE}
              onEnter={() => {
                setMode(current => (current === "login" ? "register" : "login"));
                setActiveField("email");
                setErrorMessage(null);
              }}
            >
              <Text y={20} width={300} fontSize={20} color={theme.textPrimary} textAlign="center">
                {mode() === "login" ? "Quero criar conta" : "Voltar ao login"}
              </Text>
            </View>
          </Row>
        </View>
      </View>

      <View
        x={860}
        y={92}
        width={964}
        height={896}
        color={theme.backgroundLight}
        borderRadius={28}
        padding={32}
      >
        <Text fontSize={24} fontWeight={700} color={0xffffffff}>
          Teclado da TV
        </Text>
        <Text y={42} fontSize={18} color={theme.textSecondary}>
          {`Campo ativo: ${activeField() === "email" ? "e-mail" : activeField() === "password" ? "senha" : "nome"}`}
        </Text>

        <Column y={92} width={900} gap={12} scroll="none" autofocus forwardFocus={0}>
          <For each={activeLayout()}>
            {row => (
              <Row width={900} height={64} gap={12} scroll="none">
                <For each={row}>{key => <KeyboardKey label={key} onPress={() => handleKeyPress(key)} />}</For>
              </Row>
            )}
          </For>
        </Column>
      </View>
    </View>
  );
};

interface FieldCardProps {
  label: string;
  value: string;
  active: boolean;
  onSelect: () => void;
}

const FieldCard = (props: FieldCardProps) => (
  <View style={props.active ? ACTIVE_INPUT_STYLE : INPUT_STYLE} onEnter={props.onSelect}>
    <Text x={24} y={16} fontSize={16} color={theme.textMuted}>
      {props.label}
    </Text>
    <Text x={24} y={40} width={572} fontSize={24} color={0xffffffff} contain="width" maxLines={1}>
      {props.value}
    </Text>
  </View>
);

interface KeyboardKeyProps {
  label: string;
  onPress: () => void;
}

const KeyboardKey = (props: KeyboardKeyProps) => {
  const isWide = props.label === "SPACE";
  const isAction = ["OK", "NEXT", "CLEAR", "SHIFT", "123", "abc", "DEL"].includes(props.label);
  const width = isWide ? 220 : isAction ? 112 : 96;

  return (
    <View width={width} style={KEY_STYLE} onEnter={props.onPress}>
      <Text
        y={20}
        fontSize={20}
        color={0xffffffff}
        contain="width"
        width={width}
        textAlign="center"
        maxLines={1}
      >
        {displayKeyLabel(props.label)}
      </Text>
    </View>
  );
};

function displayKeyLabel(label: string) {
  switch (label) {
    case "SPACE":
      return "ESPAÇO";
    case "DEL":
      return "APAG";
    case "NEXT":
      return "PRÓX";
    case "CLEAR":
      return "LIMPAR";
    default:
      return label;
  }
}

export default LoginPage;
