import {
  type ElementNode,
  type IntrinsicNodeStyleProps,
  type IntrinsicTextNodeStyleProps,
  Text,
  View,
} from "@lightningtv/solid";
import { Row } from "@lightningtv/solid/primitives";
import { useNavigate } from "@solidjs/router";
import { createEffect, createMemo, createSignal, Show } from "solid-js";
import { authState, registerAccount, signIn } from "./auth";
import { ApiError } from "@/lib/api";
import { SCREEN_HEIGHT, SCREEN_WIDTH } from "@/shared/layout";
import { theme } from "@/styles";
import { VirtualKeyboard } from "@/components";

type FieldName = "email" | "password" | "name";
type AuthMode = "login" | "register";

const INPUT_STYLE = {
  width: 420,
  height: 88,
  borderRadius: 14,
} satisfies IntrinsicNodeStyleProps;

const PRIMARY_ACTION_STYLE = {
  width: 300,
  height: 68,
  borderRadius: 16,
  color: theme.primary,
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  scale: 1,
  transition: { scale: { duration: 150 } },
  $focus: { color: theme.primaryLight, scale: 1.06 },
} satisfies IntrinsicNodeStyleProps;

const CHIP_STYLE = {
  width: 180,
  height: 44,
  borderRadius: 22,
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  scale: 1,
  transition: { scale: { duration: 150 } },
  $focus: { scale: 1.05 },
} satisfies IntrinsicNodeStyleProps;

const CHIP_TEXT: IntrinsicTextNodeStyleProps = {
  fontSize: 17,
  fontWeight: 700,
  color: 0xffffffff,
  textAlign: "center",
  contain: "width",
  width: 180,
};

function maskPassword(value: string) {
  return value.length > 0 ? "*".repeat(value.length) : "";
}

function authModeLabel(mode: AuthMode) {
  return mode === "login" ? "Entrar" : "Criar conta";
}

function fieldLabel(f: FieldName) {
  return f === "password" ? "Senha" : f === "email" ? "E-mail" : "Nome";
}

function getAuthErrorMessage(error: unknown, mode: AuthMode) {
  if (error instanceof ApiError) {
    if (error.retryAfter) return `Muitas tentativas agora. Tente novamente em ${error.retryAfter}s.`;
    if (error.isUnauthorized()) {
      return mode === "login" ? "E-mail ou senha incorretos." : "Não foi possível validar sua conta agora.";
    }
    if (error.code === "email_taken") return "Esse e-mail já está em uso.";
    if (error.code === "validation_error" || error.status === 422) {
      return "Revise seus dados e tente novamente.";
    }
    return error.message || "Falha ao autenticar.";
  }
  if (error instanceof Error) return error.message || "Falha ao autenticar.";
  return "Falha ao autenticar.";
}

interface ChipProps {
  label: string;
  active: boolean;
  onSelect: () => void;
}

const ModeChip = (props: ChipProps) => (
  <View
    style={CHIP_STYLE}
    color={props.active ? 0x2b1015ff : theme.surface}
    border={{
      color: props.active ? theme.primary : theme.border,
      width: props.active ? 2 : 1,
    }}
    onEnter={() => {
      props.onSelect();
      return true;
    }}
  >
    <Text {...CHIP_TEXT} y={11} color={props.active ? 0xffffffff : theme.textSecondary}>
      {props.label}
    </Text>
  </View>
);

interface FieldChipProps {
  label: string;
  value: string;
  placeholder: string;
  active: boolean;
  onSelect: () => void;
}

const FieldChip = (props: FieldChipProps) => (
  <View
    style={INPUT_STYLE}
    color={props.active ? theme.surfaceLight : theme.surface}
    border={{
      color: props.active ? theme.primary : theme.border,
      width: props.active ? 3 : 2,
    }}
    onEnter={() => {
      props.onSelect();
      return true;
    }}
  >
    <Text x={18} y={14} fontSize={13} fontWeight={700} color={theme.textMuted}>
      {props.label}
    </Text>
    <Text x={18} y={40} width={384} fontSize={22} color={0xffffffff} contain="width" maxLines={1}>
      {props.value || props.placeholder}
    </Text>
  </View>
);

const LoginPage = () => {
  const navigate = useNavigate();
  const [mode, setMode] = createSignal<AuthMode>("login");
  const [form, setForm] = createSignal({ email: "", password: "", name: "" });
  const [activeField, setActiveField] = createSignal<FieldName>("email");
  const [submitting, setSubmitting] = createSignal(false);
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null);

  let keyboardRef: ElementNode | undefined;

  const fieldsInOrder = createMemo<FieldName[]>(() =>
    mode() === "register" ? ["name", "email", "password"] : ["email", "password"],
  );

  createEffect(() => {
    if (authState.isAuthenticated()) {
      navigate("/", { replace: true });
    }
  });

  function currentValue() {
    return form()[activeField()];
  }

  function setValue(val: string) {
    const f = activeField();
    setForm(prev => ({ ...prev, [f]: val }));
  }

  function handleOk() {
    const fields = fieldsInOrder();
    const idx = fields.indexOf(activeField());
    if (idx >= 0 && idx < fields.length - 1) {
      setActiveField(fields[idx + 1]);
      setErrorMessage(null);
      return;
    }
    void submit();
  }

  function selectField(field: FieldName) {
    setActiveField(field);
    setErrorMessage(null);
    queueMicrotask(() => keyboardRef?.setFocus());
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
    if (mode() === next) return;
    setMode(next);
    setForm({ email: "", password: "", name: "" });
    setActiveField(next === "register" ? "name" : "email");
    setErrorMessage(null);
  }

  return (
    <View width={SCREEN_WIDTH} height={SCREEN_HEIGHT} color={theme.background}>
      <View x={60} y={100} width={900}>
        <Text fontSize={26} fontWeight={700} color={theme.primary}>
          STREAMIX
        </Text>

        <Row y={52} width={400} height={44} gap={12} scroll="none">
          <ModeChip label="Entrar" active={mode() === "login"} onSelect={() => switchMode("login")} />
          <ModeChip
            label="Criar conta"
            active={mode() === "register"}
            onSelect={() => switchMode("register")}
          />
        </Row>

        <Text
          y={124}
          fontSize={40}
          fontWeight={700}
          color={0xffffffff}
          contain="width"
          width={900}
          maxLines={1}
        >
          {mode() === "login" ? "Entre na sua conta" : "Crie sua conta"}
        </Text>

        <Text y={180} fontSize={16} color={theme.textSecondary} contain="width" width={900} maxLines={2}>
          Use o teclado à direita. OK avança pro próximo campo — no último, envia.
        </Text>

        <Show when={mode() === "register"}>
          <View y={236}>
            <FieldChip
              label="Nome"
              value={form().name}
              placeholder="Use o teclado"
              active={activeField() === "name"}
              onSelect={() => selectField("name")}
            />
          </View>
        </Show>

        <View y={mode() === "register" ? 340 : 236}>
          <FieldChip
            label="E-mail"
            value={form().email}
            placeholder="Use o teclado"
            active={activeField() === "email"}
            onSelect={() => selectField("email")}
          />
        </View>

        <View y={mode() === "register" ? 444 : 340}>
          <FieldChip
            label="Senha"
            value={maskPassword(form().password)}
            placeholder="Use o teclado"
            active={activeField() === "password"}
            onSelect={() => selectField("password")}
          />
        </View>

        <View y={mode() === "register" ? 548 : 444}>
          <View
            style={PRIMARY_ACTION_STYLE}
            onEnter={() => {
              void submit();
              return true;
            }}
          >
            <Text fontSize={22} fontWeight={700} color={0xffffffff}>
              {submitting() ? "Aguarde..." : authModeLabel(mode())}
            </Text>
          </View>
        </View>

        <Show when={errorMessage()}>
          <View
            y={mode() === "register" ? 640 : 536}
            width={420}
            height={52}
            color={0x3a1518ff}
            borderRadius={12}
            skipFocus
          >
            <Text x={16} y={16} width={388} fontSize={14} color={0xffa8a8ff} contain="width" maxLines={2}>
              {errorMessage() || ""}
            </Text>
          </View>
        </Show>
      </View>

      {/* Virtual keyboard — no Tizen IME, Lightning-native */}
      <View x={960} y={200} width={900}>
        <Text fontSize={20} fontWeight={700} color={theme.textPrimary}>
          Teclado
        </Text>
        <Text y={32} fontSize={14} color={theme.textMuted}>
          {`Digitando: ${fieldLabel(activeField())}`}
        </Text>

        <View y={72}>
          <VirtualKeyboard
            ref={keyboardRef}
            value={currentValue()}
            password={activeField() === "password"}
            autofocus
            onChange={setValue}
            onSubmit={handleOk}
          />
        </View>
      </View>
    </View>
  );
};

export default LoginPage;
