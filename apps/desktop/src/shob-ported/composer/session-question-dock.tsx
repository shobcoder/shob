import { createEffect, createMemo, createSignal } from "solid-js"
import { useMutation } from "@tanstack/solid-query"
import { showToast } from "@shob-ai/ui/toast"
import type { QuestionAnswer, QuestionRequest } from "@shob-ai/sdk/v2/client"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import { SessionChoicePrompt, type SessionChoiceOption } from "./session-choice-prompt"

export const CUSTOM_ANSWER_ID = "custom"
export const CUSTOM_ANSWER_LABEL = "No, and tell Codex what to do differently"

type QuestionItem = QuestionRequest["questions"][number]

export function questionDefaultSelection(question: QuestionItem | undefined) {
  if (!question || question.multiple === true) return []
  if (question.options[0]) return ["option:0"]
  return question.custom !== false ? [CUSTOM_ANSWER_ID] : []
}

export function toggleQuestionSelection(current: string[], id: string, multiple: boolean) {
  if (!multiple) return [id]
  return current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
}

export function buildQuestionAnswer(question: QuestionItem | undefined, selectedIds: string[], customValue: string) {
  if (!question) return []

  const answers = selectedIds.flatMap((id) => {
    if (id === CUSTOM_ANSWER_ID) {
      const custom = customValue.trim()
      return custom ? [custom] : []
    }
    const optionIndex = Number(id.slice("option:".length))
    const label = question.options[optionIndex]?.label
    return label ? [label] : []
  })

  return Array.from(new Set(answers))
}

export function SessionQuestionDock(props: { request: QuestionRequest; onSubmit: () => void }) {
  const sdk = useSDK()
  const language = useLanguage()
  const [tab, setTab] = createSignal(0)
  const [activeIndex, setActiveIndex] = createSignal(0)
  const [selectedByQuestion, setSelectedByQuestion] = createSignal<string[][]>([])
  const [customByQuestion, setCustomByQuestion] = createSignal<string[]>([])

  const questions = createMemo(() => props.request.questions)
  const question = createMemo(() => questions()[tab()])
  const options = createMemo(() => question()?.options ?? [])
  const customEnabled = createMemo(() => question()?.custom !== false)
  const multi = createMemo(() => question()?.multiple === true)

  const defaultSelection = (index: number) => questionDefaultSelection(questions()[index])

  const selected = (index = tab()) => selectedByQuestion()[index] ?? defaultSelection(index)
  const customValue = (index = tab()) => customByQuestion()[index] ?? ""

  const fail = (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err)
    showToast({ title: language.t("common.requestFailed"), description: message })
  }

  const replyMutation = useMutation(() => ({
    mutationFn: (answers: QuestionAnswer[]) => sdk.client.question.reply({ requestID: props.request.id, answers }),
    onMutate: () => props.onSubmit(),
    onError: fail,
  }))

  const rejectMutation = useMutation(() => ({
    mutationFn: () => sdk.client.question.reject({ requestID: props.request.id }),
    onMutate: () => props.onSubmit(),
    onError: fail,
  }))

  const sending = createMemo(() => replyMutation.isPending || rejectMutation.isPending)

  let resetRequestID: string | undefined
  createEffect(() => {
    const requestID = props.request.id
    if (requestID === resetRequestID) return
    resetRequestID = requestID
    setTab(0)
    setActiveIndex(0)
    setSelectedByQuestion([])
    setCustomByQuestion([])
  })

  const choices = createMemo<SessionChoiceOption[]>(() => {
    const regular = options().map((opt, index) => ({
      id: `option:${index}`,
      label: opt.label,
      description: opt.description,
    }))
    if (!customEnabled()) return regular
    return [
      ...regular,
      {
        id: CUSTOM_ANSWER_ID,
        label: CUSTOM_ANSWER_LABEL,
        customValue: customValue(),
        customPlaceholder: language.t("ui.question.custom.placeholder"),
        onCustomInput(value: string) {
          const next = [...customByQuestion()]
          next[tab()] = value
          setCustomByQuestion(next)
        },
      },
    ]
  })

  createEffect(() => {
    const max = Math.max(choices().length - 1, 0)
    if (activeIndex() > max) setActiveIndex(max)
  })

  const setSelected = (index: number, ids: string[]) => {
    const next = [...selectedByQuestion()]
    next[index] = ids
    setSelectedByQuestion(next)
  }

  const select = (id: string) => {
    if (sending()) return
    setSelected(tab(), toggleQuestionSelection(selected(), id, multi()))
  }

  const answerFor = (index: number): string[] => {
    return buildQuestionAnswer(questions()[index], selected(index), customValue(index))
  }

  const canContinue = createMemo(() => {
    if (sending()) return false
    const answers = answerFor(tab())
    return answers.length > 0
  })

  const goTo = (index: number) => {
    const next = Math.min(Math.max(index, 0), Math.max(questions().length - 1, 0))
    setTab(next)
    const active = selected(next)[0]
    const optionIndex = choices().findIndex((choice) => choice.id === active)
    setActiveIndex(Math.max(optionIndex, 0))
  }

  const submit = async () => {
    if (!canContinue()) return
    if (tab() < questions().length - 1) {
      goTo(tab() + 1)
      return
    }
    const answers = questions().map((_, index) => answerFor(index))
    await replyMutation.mutateAsync(answers)
  }

  const reject = async () => {
    if (sending()) return
    await rejectMutation.mutateAsync()
  }

  return (
    <SessionChoicePrompt
      title={question()?.question ?? language.t("ui.tool.questions")}
      options={choices()}
      selectedIds={selected()}
      activeIndex={activeIndex()}
      disabled={sending()}
      progress={
        questions().length > 1
          ? {
              current: tab() + 1,
              total: questions().length,
              previousDisabled: tab() === 0,
              nextDisabled: tab() >= questions().length - 1 || !canContinue(),
              onPrevious: () => goTo(tab() - 1),
              onNext: () => {
                if (canContinue()) goTo(tab() + 1)
              },
            }
          : undefined
      }
      continueDisabled={!canContinue()}
      dismissLabel={language.t("ui.common.dismiss")}
      onActiveIndexChange={setActiveIndex}
      onSelect={select}
      onDismiss={reject}
      onContinue={submit}
    />
  )
}
