import { ElementNode, type IntrinsicNodeStyleProps, Text, View } from "@lightningtv/solid";
import { Column, Row } from "@lightningtv/solid/primitives";
import { createMemo, createResource, createSignal, For, onMount, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import api, { type Channel, type EpgProgram } from "@/lib/api";
import { proxyImageUrl } from "@/lib/imageUrl";
import { onNavReset } from "@/shared/navReset";
import { theme } from "@/styles";

const EPG_WINDOW_HOURS = 8;
const TIME_SLOT_WIDTH = 200;
const CHANNEL_COLUMN_WIDTH = 220;
const ROW_HEIGHT = 82;
const GUIDE_WIDTH = 1660;
const PROGRAM_AREA_WIDTH = GUIDE_WIDTH - CHANNEL_COLUMN_WIDTH;
const EMPTY_ROWS_AFTER = 28;

// Styles
const ChannelRowStyle = {
  height: ROW_HEIGHT,
  color: theme.surface,
  transition: {
    color: { duration: 150 },
  },
  $focus: {
    color: theme.surfaceHover,
  },
} satisfies IntrinsicNodeStyleProps;

const TimeHeaderStyle = {
  height: 50,
  color: theme.backgroundElevated,
} satisfies IntrinsicNodeStyleProps;

interface Program {
  id: string | number;
  title: string;
  start: Date;
  end: Date;
  description?: string;
  width: number;
}

interface ChannelWithPrograms {
  channel: Channel;
  programs: Program[];
}

const programWidthFromDates = (start: Date, end: Date) => {
  const durationMinutes = Math.max(15, (end.getTime() - start.getTime()) / (1000 * 60));
  return Math.max(120, (durationMinutes / 30) * TIME_SLOT_WIDTH);
};

// Convert EPG payload strings into date objects.
const toProgram = (p: EpgProgram): Program => ({
  id: p.id,
  title: p.title,
  start: new Date(p.start),
  end: new Date(p.end),
  description: p.description ?? undefined,
  width: programWidthFromDates(new Date(p.start), new Date(p.end)),
});

const Guide = () => {
  const navigate = useNavigate();
  const [currentTime, setCurrentTime] = createSignal(new Date());

  let guideGrid: ElementNode | undefined;

  // Reset to the grid when the user re-clicks "Guia TV" in the sidebar.
  onNavReset(() => guideGrid?.setFocus());

  // Fetch the first page of channels for the grid.
  const [channels] = createResource(() => api.getChannels({ limit: 50 }));

  // Fetch enough EPG data to cover horizontal scrolling.
  const [epg] = createResource(
    () => channels()?.data?.map(c => c.id),
    async (ids): Promise<Record<string, Program[]>> => {
      if (!ids?.length) return {};
      const raw = await api.getEpgPrograms(ids, EPG_WINDOW_HOURS);
      const byChannel: Record<string, Program[]> = {};
      for (const [cid, programs] of Object.entries(raw)) {
        byChannel[cid] = programs.map(toProgram).sort((a, b) => a.start.getTime() - b.start.getTime());
      }
      return byChannel;
    },
  );

  const channelsWithPrograms = createMemo<ChannelWithPrograms[]>(() => {
    const data = channels()?.data || [];
    const epgMap = epg() || {};
    const rows = data.map((channel, index) => ({
      channel,
      index,
      programs: epgMap[String(channel.id)] || [],
    }));
    const withPrograms = rows.filter(row => row.programs.length > 0);
    const emptyRows = rows.filter(row => row.programs.length === 0).slice(0, EMPTY_ROWS_AFTER);
    return [...withPrograms, ...emptyRows].map(({ channel, programs }) => ({ channel, programs }));
  });

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

  // Check if program is currently playing
  const isNowPlaying = (program: Program) => {
    const now = currentTime();
    return program.start <= now && program.end > now;
  };

  const getProgramProgressWidth = (program: Program) => {
    const now = currentTime().getTime();
    const total = Math.max(1, program.end.getTime() - program.start.getTime());
    const elapsed = Math.min(total, Math.max(0, now - program.start.getTime()));
    return Math.max(8, Math.floor(((program.width - 18) * elapsed) / total));
  };

  // Handle channel selection
  const handleChannelSelect = (channel: Channel) => {
    navigate(`/player/channel/${channel.id}`);
  };

  return (
    <Column width={1700} height={1080} color={theme.background} scroll="none">
      {/* Header */}
      <View width={1680} height={70} x={20} skipFocus>
        <Text y={10} fontSize={42} fontWeight={700} color={0xffffffff}>
          Guia de Programação
        </Text>
        <Text x={1030} y={19} width={630} fontSize={24} color={theme.textSecondary} textAlign="right">
          {currentTime().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
        </Text>
      </View>

      {/* Time Header */}
      <View x={20} width={GUIDE_WIDTH} style={TimeHeaderStyle} skipFocus>
        {/* Channel column header */}
        <View width={CHANNEL_COLUMN_WIDTH} height={50} color={theme.panel} borderRadius={8}>
          <Text x={16} y={13} fontSize={18} color={theme.textMuted}>
            Canal
          </Text>
        </View>

        {/* Time slots */}
        <View x={CHANNEL_COLUMN_WIDTH} width={PROGRAM_AREA_WIDTH} clipping>
          <Row x={0} width={timeSlots().length * TIME_SLOT_WIDTH} height={50} gap={0}>
            <For each={timeSlots()}>
              {slot => (
                <View width={TIME_SLOT_WIDTH} height={50}>
                  <Text x={16} y={13} fontSize={16} color={theme.textSecondary}>
                    {formatTime(slot)}
                  </Text>
                </View>
              )}
            </For>
          </Row>
        </View>
      </View>

      {/* EPG Grid */}
      <Column ref={guideGrid} x={20} width={GUIDE_WIDTH} height={910} gap={3} scroll="auto" autofocus>
        <Show when={channels.loading}>
          <View
            width={1640}
            height={400}
            display="flex"
            justifyContent="center"
            alignItems="center"
            skipFocus
          >
            <Text fontSize={28} color={theme.textMuted}>
              Carregando guia...
            </Text>
          </View>
        </Show>

        <For each={channelsWithPrograms()}>
          {({ channel, programs }) => (
            <View width={GUIDE_WIDTH} height={ROW_HEIGHT} style={ChannelRowStyle} forwardStates>
              {/* Channel info */}
              <View width={CHANNEL_COLUMN_WIDTH} height={ROW_HEIGHT} color={theme.panel}>
                <Show when={channel.logo_url}>
                  <View
                    x={12}
                    y={13}
                    width={60}
                    height={40}
                    src={proxyImageUrl(channel.logo_url, 120)}
                    color={0xffffffff}
                  />
                </Show>
                <Text x={84} y={24} fontSize={15} color={0xffffffff} contain="width" width={120} maxLines={2}>
                  {channel.name}
                </Text>
              </View>

              {/* Allow direct channel playback when EPG data is unavailable. */}
              <Show when={programs.length === 0}>
                <View
                  x={CHANNEL_COLUMN_WIDTH}
                  width={PROGRAM_AREA_WIDTH}
                  height={ROW_HEIGHT}
                  color={theme.surface}
                  borderRadius={6}
                  border={{ color: theme.borderSubtle, width: 1 }}
                  transition={{ color: { duration: 150 } }}
                  $focus={{ color: theme.surfaceHover, border: { color: theme.primary, width: 2 } }}
                  onEnter={() => handleChannelSelect(channel)}
                >
                  <Text x={18} y={30} fontSize={15} color={theme.textMuted}>
                    Sem programação disponível · OK para assistir ao vivo
                  </Text>
                </View>
              </Show>

              {/* Programs */}
              <Row
                x={CHANNEL_COLUMN_WIDTH}
                width={PROGRAM_AREA_WIDTH}
                height={ROW_HEIGHT}
                gap={4}
                scroll="auto"
                clipping
              >
                <For each={programs}>
                  {program => (
                    <View
                      width={program.width - 4}
                      height={ROW_HEIGHT - 4}
                      y={2}
                      color={isNowPlaying(program) ? theme.surfaceActive : theme.surface}
                      borderRadius={6}
                      border={{ color: isNowPlaying(program) ? 0x7a1f27ff : theme.borderSubtle, width: 1 }}
                      style={{
                        transition: { color: { duration: 150 }, scale: { duration: 150 } },
                        $focus: {
                          color: theme.surfaceHover,
                          scale: 1.02,
                          border: { color: theme.primary, width: 2 },
                        },
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
                        <View
                          x={9}
                          y={ROW_HEIGHT - 10}
                          width={getProgramProgressWidth(program)}
                          height={3}
                          color={theme.primary}
                          borderRadius={3}
                        />
                      </Show>

                      <Text
                        x={isNowPlaying(program) ? 14 : 8}
                        y={8}
                        fontSize={14}
                        fontWeight={700}
                        color={0xffffffff}
                        contain="width"
                        width={program.width - 20}
                        maxLines={1}
                      >
                        {program.title}
                      </Text>

                      <Text
                        x={isNowPlaying(program) ? 14 : 8}
                        y={30}
                        fontSize={12}
                        color={theme.textSecondary}
                      >
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
          <Text fontSize={14} color={theme.textSecondary}>
            Ao vivo agora
          </Text>
        </View>
        <Text fontSize={14} color={theme.textMuted}>
          Navegue pela grade • OK assistir
        </Text>
      </View>
    </Column>
  );
};

export default Guide;
