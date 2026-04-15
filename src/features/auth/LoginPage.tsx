import { type IntrinsicNodeStyleProps, Text, View } from "@lightningtv/solid";
import { Column, Row } from "@lightningtv/solid/primitives";
import { useNavigate } from "@solidjs/router";
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { authState, initializeAuth, registerAccount, signIn } from "./auth";
import { ApiError } from "@/lib/api";
import { SCREEN_HEIGHT, SCREEN_WIDTH } from "@/shared/layout";
import { theme } from "@/styles";
import { closeTvKeyboard, openTvKeyboard, type TvKeyboardInputType } from "@/shared/tvKeyboard";

type FieldName = "email" | "password" | "name";
type AuthMode = "login" | "register";

const INPUT_STYLE = {
  width: 760,
  height: 104,
  borderRadius: 18,
  color: theme.surface,
  border: { color: theme.border, width: 2 },
  scale: 1,
  transition: { scale: { duration: 150 }, color: { duration: 150 } },
  $focus: {
    color: theme.surfaceHover,
    border: { color: theme.primary, width: 3 },
    scale: 1.015,
  },
} satisfies IntrinsicNodeStyleProps;

const ACTIVE_INPUT_STYLE = {
  ...INPUT_STYLE,
  color: theme.surfaceLight,
  border: { color: theme.primary, width: 3 },
} satisfies IntrinsicNodeStyleProps;

const PRIMARY_ACTION_STYLE = {
  width: 320,
  height: 68,
  borderRadius: 20,
  color: theme.primary,
  scale: 1,
  transition: { scale: { duration: 150 }, color: { duration: 150 } },
  $focus: {
    color: theme.primaryLight,
    scale: 1.06,
  },
} satisfies IntrinsicNodeStyleProps;

const SECONDARY_ACTION_STYLE = {
  width: 320,
  height: 68,
  borderRadius: 20,
  color: theme.surfaceLight,
  border: { color: theme.borderLight, width: 2 },
  scale: 1,
  transition: { scale: { duration: 150 }, color: { duration: 150 } },
  $focus: {
    border: { color: theme.primary, width: 3 },
    color: theme.surfaceHover,
    scale: 1.06,
  },
} satisfies IntrinsicNodeStyleProps;

const MODE_CHIP_STYLE = {
  width: 180,
  height: 48,
  borderRadius: 24,
  color: theme.surface,
  border: { color: theme.border, width: 1 },
  scale: 1,
  transition: { scale: { duration: 150 } },
  $focus: {
    border: { color: theme.primary, width: 3 },
    color: theme.surfaceHover,
    scale: 1.05,
  },
} satisfies IntrinsicNodeStyleProps;

const ACTIVE_MODE_CHIP_STYLE = {
  width: 180,
  height: 48,
  borderRadius: 24,
  color: 0x2b1015ff,
  border: { color: theme.primary, width: 2 },
  scale: 1,
  transition: { scale: { duration: 150 } },
  $focus: {
    color: 0x401820ff,
    border: { color: theme.primary, width: 3 },
    scale: 1.05,
  },
} satisfies IntrinsicNodeStyleProps;

const FORM_PANEL_BASE = {
  width: 820,
  color: theme.backgroundLight,
  borderRadius: 28,
  border: { color: theme.border, width: 1 },
} satisfies IntrinsicNodeStyleProps;

const FORM_PANEL_LOGIN = { ...FORM_PANEL_BASE, height: 472 } satisfies IntrinsicNodeStyleProps;
const FORM_PANEL_REGISTER = { ...FORM_PANEL_BASE, height: 596 } satisfies IntrinsicNodeStyleProps;

const INFO_CARD_STYLE = {
  width: 260,
  height: 58,
  color: theme.surface,
  borderRadius: 16,
  border: { color: theme.border, width: 1 },
} satisfies IntrinsicNodeStyleProps;

const FIELD_ORDER: FieldName[] = ["email", "password", "name"];

const FIELD_LABEL: Record<FieldName, string> = {
  email: "E-mail",
  password: "Senha",
  name: "Nome",
};

const FIELD_PLACEHOLDER: Record<FieldName, string> = {
  email: "Toque OK para abrir o teclado",
  password: "Toque OK para digitar sua senha",
  name: "Toque OK para digitar seu nome",
};

const FIELD_TYPE: Record<FieldName, TvKeyboardInputType> = {
  email: "email",
  password: "password",
  name: "text",
};

function maskPassword(value: string) {
  return value.length > 0 ? "*".repeat(value.length) : FIELD_PLACEHOLDER.password;
}

function authModeLabel(mode: AuthMode) {
  return mode === "login" ? "Entrar" : "Criar conta";
}

function getAuthErrorMessage(error: unknown, mode: AuthMode) {
  if (error instanceof ApiError) {
    if (error.retryAfter) {
      return `Muitas tentativas agora. Tente novamente em ${error.retryAfter}s.`;
    }

    if (error.isUnauthorized()) {
      return mode === "login"
        ? "E-mail ou senha incorretos. Confira os dados e tente de novo."
        : "Não foi possível validar sua conta agora. Tente novamente.";
    }

    if (error.code === "email_taken") {
      return "Esse e-mail já está em uso. Faça login ou use outro endereço.";
    }

    if (error.code === "validation_error" || error.status === 422) {
      return mode === "register"
        ? "Revise nome, e-mail e senha antes de continuar."
        : "Revise seus dados e tente novamente.";
    }

    return error.message || "Falha ao autenticar.";
  }

  if (error instanceof Error) {
    return error.message || "Falha ao autenticar.";
  }

  return "Falha ao autenticar.";
}

const LoginPage = () => {
  const navigate = useNavigate();
  const [mode, setMode] = createSignal<AuthMode>("login");
  const [form, setForm] = createSignal({ email: "", password: "", name: "" });
  const [editingField, setEditingField] = createSignal<FieldName | null>(null);
  const [submitting, setSubmitting] = createSignal(false);
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null);

  onMount(() => {
    void initializeAuth();
  });

  onCleanup(() => closeTvKeyboard());

  const activeFields = createMemo<FieldName[]>(() =>
    mode() === "register" ? FIELD_ORDER : FIELD_ORDER.filter(field => field !== "name"),
  );

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

  function updateField(field: FieldName, value: string) {
    setForm(current => ({ ...current, [field]: value }));
  }

  function editField(field: FieldName) {
    if (submitting()) return true;
    setEditingField(field);
    openTvKeyboard({
      value: form()[field],
      type: FIELD_TYPE[field],
      onInput: value => updateField(field, value),
      onSubmit: () => {
        closeTvKeyboard();
        const fields = activeFields();
        const idx = fields.indexOf(field);
        if (idx >= 0 && idx < fields.length - 1) {
          editField(fields[idx + 1]);
        } else {
          setEditingField(null);
          void submit();
        }
      },
      onClose: () => setEditingField(null),
    });
    return true;
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
      setErrorMessage(getAuthErrorMessage(error, mode()));
    } finally {
      setSubmitting(false);
    }
  }

  function switchMode(next: AuthMode) {
    setMode(next);
    setErrorMessage(null);
    closeTvKeyboard();
    setEditingField(null);
  }

  return (
    <View width={SCREEN_WIDTH} height={SCREEN_HEIGHT} color={theme.background} forwardFocus={1}>
      <View x={550} y={88} width={820} height={904}>
        <Text fontSize={28} fontWeight={700} color={theme.primary}>
          STREAMIX
        </Text>

        <Row y={58} width={380} height={48} gap={16} scroll="none">
          <View
            style={mode() === "login" ? ACTIVE_MODE_CHIP_STYLE : MODE_CHIP_STYLE}
            onEnter={() => (switchMode("login"), true)}
          >
            <Text
              y={13}
              width={180}
              fontSize={18}
              fontWeight={700}
              color={0xffffffff}
              textAlign="center"
              contain="width"
            >
              Entrar
            </Text>
          </View>
          <View
            style={mode() === "register" ? ACTIVE_MODE_CHIP_STYLE : MODE_CHIP_STYLE}
            onEnter={() => (switchMode("register"), true)}
          >
            <Text
              y={13}
              width={180}
              fontSize={18}
              fontWeight={700}
              color={0xffffffff}
              textAlign="center"
              contain="width"
            >
              Criar conta
            </Text>
          </View>
        </Row>

        <Text y={126} fontSize={58} fontWeight={700} color={0xffffffff}>
          {titleCopy()}
        </Text>
        <Text y={206} width={780} fontSize={22} color={theme.textSecondary} maxLines={2} contain="width">
          {descriptionCopy()}
        </Text>

        <Row y={274} width={820} height={58} gap={14} scroll="none" skipFocus>
          <For each={highlights()}>
            {item => (
              <View style={INFO_CARD_STYLE}>
                <Text
                  y={19}
                  width={260}
                  fontSize={16}
                  color={theme.textPrimary}
                  textAlign="center"
                  contain="width"
                  maxLines={1}
                >
                  {item}
                </Text>
              </View>
            )}
          </For>
        </Row>

        <View y={354} style={mode() === "register" ? FORM_PANEL_REGISTER : FORM_PANEL_LOGIN}>
          <Column x={30} y={24} width={760} gap={18} scroll="none">
            <FieldCard
              field="email"
              value={form().email}
              editing={editingField() === "email"}
              onEdit={() => editField("email")}
            />
            <FieldCard
              field="password"
              value={form().password}
              editing={editingField() === "password"}
              onEdit={() => editField("password")}
            />
            <Show when={mode() === "register"}>
              <FieldCard
                field="name"
                value={form().name}
                editing={editingField() === "name"}
                onEdit={() => editField("name")}
              />
            </Show>
          </Column>

          <View
            x={30}
            y={mode() === "register" ? 388 : 268}
            width={760}
            height={28}
            color={0x00000000}
            skipFocus
          >
            <Text fontSize={15} color={theme.textMuted}>
              Selecione um campo e pressione OK para abrir o teclado da TV.
            </Text>
          </View>

          <Show when={errorMessage()}>
            <View
              x={30}
              y={mode() === "register" ? 428 : 308}
              width={760}
              height={56}
              color={0x3a1518ff}
              borderRadius={14}
            >
              <Text x={20} y={17} width={720} fontSize={16} color={0xffa8a8ff} contain="width" maxLines={1}>
                {errorMessage() || ""}
              </Text>
            </View>
          </Show>

          <Row x={30} y={mode() === "register" ? 500 : 380} width={760} gap={24} scroll="none">
            <View
              style={PRIMARY_ACTION_STYLE}
              onEnter={() => {
                void submit();
                return true;
              }}
            >
              <Text
                y={19}
                width={320}
                fontSize={22}
                fontWeight={700}
                color={0xffffffff}
                textAlign="center"
                contain="width"
              >
                {submitting() ? "Aguarde..." : authModeLabel(mode())}
              </Text>
            </View>
            <View
              style={SECONDARY_ACTION_STYLE}
              onEnter={() => {
                switchMode(mode() === "login" ? "register" : "login");
                return true;
              }}
            >
              <Text
                y={21}
                width={320}
                fontSize={20}
                color={theme.textPrimary}
                textAlign="center"
                contain="width"
              >
                {mode() === "login" ? "Quero criar conta" : "Voltar ao login"}
              </Text>
            </View>
          </Row>
        </View>
      </View>
    </View>
  );
};

interface FieldCardProps {
  field: FieldName;
  value: string;
  editing: boolean;
  onEdit: () => boolean;
}

const FieldCard = (props: FieldCardProps) => {
  const displayValue = () => {
    if (props.field === "password") return maskPassword(props.value);
    return props.value || FIELD_PLACEHOLDER[props.field];
  };

  return (
    <View style={props.editing ? ACTIVE_INPUT_STYLE : INPUT_STYLE} forwardStates onEnter={props.onEdit}>
      <Text x={24} y={20} fontSize={14} fontWeight={700} color={theme.textMuted}>
        {FIELD_LABEL[props.field]}
      </Text>
      <Text x={24} y={56} width={712} fontSize={24} color={0xffffffff} contain="width" maxLines={1}>
        {displayValue()}
      </Text>
    </View>
  );
};

export default LoginPage;
