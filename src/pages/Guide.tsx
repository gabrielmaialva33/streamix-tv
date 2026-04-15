import { View, Text, ElementNode, type IntrinsicNodeStyleProps } from "@lightningtv/solid";
import { Column, Row } from "@lightningtv/solid/primitives";
import { createSignal, createResource, For, Show, onMount } from "solid-js";
import { useNavigate } from "@solidjs/router";
import api, { type Channel, type EpgProgram } from "../lib/api";
import { theme } from "../styles";

// Time slot width (30 min = 200px)
const TIME_SLOT_WIDTH = 200;
const CHANNEL_COLUMN_WIDTH = 200;
const ROW_HEIGHT = 80;

// Styles
const ChannelRowStyle = {
  height: ROW_HEIGHT,
  color: 0x1a1a2eff,
  transition: {
    color: { duration: 150 },
  },
  $focus: {
    color: 0x2a2a3eff,
  },
} satisfies IntrinsicNodeStyleProps;

const TimeHeaderStyle = {
  height: 50,
  color: 0x111111ff,
} satisfies IntrinsicNodeStyleProps;

interface Program {
  id: string | number;
  title: string;
  start: Date;
  end: Date;
  description?: string;
}

interface ChannelWithPrograms {
  channel: Channel;
  programs: Program[];
}

// Converte EpgProgram (ISO strings) em Program (Date) ja ordenado por inicio
const toProgram = (p: EpgProgram): Program => ({
  id: p.id,
  title: p.title,
  start: new Date(p.start),
  end: new Date(p.end),
  description: p.description,
});

const Guide = () => {
  const navigate = useNavigate();
  const [currentTime, setCurrentTime] = createSignal(new Date());
  const [timelineOffset, _setTimelineOffset] = createSignal(0);

  let guideGrid: ElementNode | undefined;

  // Fetch channels (primeira pagina ja da pra preencher o guia)
  const [channels] = createResource(() => api.getChannels({ limit: 50 }));

  // Fetch EPG — janela de 4h antes / 12h depois pra cobrir rolagem horizontal
  const [epg] = createResource(
    () => channels()?.data?.map(c => c.id),
    async (ids): Promise<Record<string, Program[]>> => {
      if (!ids?.length) return {};
      // Backend aceita janela em horas a frente (default 6, max 12)
      const raw = await api.getEpgPrograms(ids, 12);
      const byChannel: Record<string, Program[]> = {};
      for (const [cid, programs] of Object.entries(raw)) {
        byChannel[cid] = programs.map(toProgram).sort((a, b) => a.start.getTime() - b.start.getTime());
      }
      return byChannel;
    },
  );

  const channelsWithPrograms = (): ChannelWithPrograms[] => {
    const data = channels()?.data || [];
    const epgMap = epg() || {};
    return data.map(channel => ({
      channel,
      programs: epgMap[String(channel.id)] || [],
    }));
  };

  // Update current time every minute
  onMount(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(interval);
  });

  // Time slots for header (6 hours window)
  const timeSlots = () => {
    const slots: Date[] = [];
    const now = new Date();
    now.setMinutes(0, 0, 0);

    for (let i = -1; i < 12; i++) {
      slots.push(new Date(now.getTime() + i * 30 * 60 * 1000));
    }
    return slots;
  };

  // Format time
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  };

  // Calculate program width based on duration
  const getProgramWidth = (program: Program) => {
    const durationMinutes = (program.end.getTime() - program.start.getTime()) / (1000 * 60);
    return (durationMinutes / 30) * TIME_SLOT_WIDTH;
  };

  // Check if program is currently playing
  const isNowPlaying = (program: Program) => {
    const now = currentTime();
    return program.start <= now && program.end > now;
  };

  // Handle channel selection
  const handleChannelSelect = (channel: Channel) => {
    navigate(`/player/channel/${channel.id}`);
  };

  return (
    <Column width={1700} height={1080} scroll="none">
      {/* Header */}
      <View width={1680} height={60} x={20} skipFocus>
        <Text y={10} fontSize={42} fontWeight="bold" color={0xffffffff}>
          Guia de Programação
        </Text>
        <Text x={1400} y={20} fontSize={24} color={0xaaaaaaff}>
          {currentTime().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
        </Text>
      </View>

      {/* Time Header */}
      <View x={20} width={1660} style={TimeHeaderStyle} skipFocus>
        {/* Channel column header */}
        <View width={CHANNEL_COLUMN_WIDTH} height={50} color={0x1a1a2eff}>
          <Text x={10} y={12} fontSize={18} color={0x888888ff}>
            Canal
          </Text>
        </View>

        {/* Time slots */}
        <View x={CHANNEL_COLUMN_WIDTH} width={1660 - CHANNEL_COLUMN_WIDTH} clipping>
          <Row x={-timelineOffset()} width={timeSlots().length * TIME_SLOT_WIDTH} height={50} gap={0}>
            <For each={timeSlots()}>
              {slot => (
                <View width={TIME_SLOT_WIDTH} height={50}>
                  <Text x={10} y={12} fontSize={16} color={0xaaaaaaff}>
                    {formatTime(slot)}
                  </Text>
                </View>
              )}
            </For>
          </Row>
        </View>
      </View>

      {/* EPG Grid */}
      <Column ref={guideGrid} x={20} width={1660} height={920} gap={2} scroll="auto" autofocus>
        <Show when={channels.loading}>
          <View
            width={1640}
            height={400}
            display="flex"
            justifyContent="center"
            alignItems="center"
            skipFocus
          >
            <Text fontSize={28} color={0x888888ff}>
              Carregando guia...
            </Text>
          </View>
        </Show>

        <For each={channelsWithPrograms()}>
          {({ channel, programs }) => (
            <View width={1660} height={ROW_HEIGHT} style={ChannelRowStyle} forwardStates>
              {/* Channel info */}
              <View width={CHANNEL_COLUMN_WIDTH} height={ROW_HEIGHT} color={0x1a1a2eff}>
                <Show when={channel.logo_url}>
                  <View x={10} y={10} width={60} height={40} src={channel.logo_url} color={0xffffffff} />
                </Show>
                <Text x={80} y={25} fontSize={14} color={0xffffffff} contain="width" width={110} maxLines={2}>
                  {channel.name}
                </Text>
              </View>

              {/* Sem EPG: fallback clicavel pra abrir o canal direto */}
              <Show when={programs.length === 0}>
                <View
                  x={CHANNEL_COLUMN_WIDTH}
                  width={1660 - CHANNEL_COLUMN_WIDTH}
                  height={ROW_HEIGHT}
                  color={0x1a1a2eff}
                  transition={{ color: { duration: 150 } }}
                  onEnter={() => handleChannelSelect(channel)}
                >
                  <Text x={16} y={28} fontSize={14} color={0x666666ff}>
                    Sem programacao disponivel — OK para assistir ao vivo
                  </Text>
                </View>
              </Show>

              {/* Programs */}
              <Row
                x={CHANNEL_COLUMN_WIDTH}
                width={1660 - CHANNEL_COLUMN_WIDTH}
                height={ROW_HEIGHT}
                gap={2}
                scroll="auto"
                clipping
              >
                <For each={programs}>
                  {program => (
                    <View
                      width={getProgramWidth(program) - 4}
                      height={ROW_HEIGHT - 4}
                      y={2}
                      color={isNowPlaying(program) ? 0x333333ff : 0x222222ff}
                      borderRadius={4}
                      style={{
                        transition: { color: { duration: 150 }, scale: { duration: 150 } },
                        $focus: { color: theme.primary, scale: 1.02 },
                      }}
                      onEnter={() => handleChannelSelect(channel)}
                      forwardStates
                    >
                      {/* Now playing indicator */}
                      <Show when={isNowPlaying(program)}>
                        <View
                          width={4}
                          height={ROW_HEIGHT - 8}
                          y={2}
                          x={2}
                          color={theme.primary}
                          borderRadius={2}
                        />
                      </Show>

                      <Text
                        x={isNowPlaying(program) ? 14 : 8}
                        y={8}
                        fontSize={14}
                        fontWeight="bold"
                        color={0xffffffff}
                        contain="width"
                        width={getProgramWidth(program) - 20}
                        maxLines={1}
                      >
                        {program.title}
                      </Text>

                      <Text x={isNowPlaying(program) ? 14 : 8} y={30} fontSize={12} color={0xaaaaaaff}>
                        {formatTime(program.start)} - {formatTime(program.end)}
                      </Text>
                    </View>
                  )}
                </For>
              </Row>
            </View>
          )}
        </For>
      </Column>

      {/* Legend */}
      <View x={20} y={1000} display="flex" gap={30} skipFocus>
        <View display="flex" gap={8}>
          <View width={16} height={16} color={theme.primary} borderRadius={2} y={2} />
          <Text fontSize={14} color={0x888888ff}>
            Ao vivo agora
          </Text>
        </View>
        <Text fontSize={14} color={0x666666ff}>
          ← → Navegar OK Assistir
        </Text>
      </View>
    </Column>
  );
};

export default Guide;
