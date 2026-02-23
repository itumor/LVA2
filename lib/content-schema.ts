import { z } from "zod";

const questionSchema = z.object({
  id: z.string(),
  stemLv: z.string().optional(),
  stemEn: z.string().optional(),
  options: z.array(z.string()).optional(),
  correctAnswer: z.union([z.string(), z.boolean()]).optional(),
  evidenceRef: z.string().optional(),
  evidenceSpan: z
    .object({
      start: z.number(),
      end: z.number(),
    })
    .optional(),
  hint: z.string().optional(),
  imageHint: z.string().optional(),
  imageUrl: z.string().optional(),
  followUp: z.string().optional(),
  bulletPoints: z.array(z.string()).optional(),
  minWords: z.number().optional(),
  promptLv: z.string().optional(),
  adText: z.string().optional(),
  target: z.string().optional(),
  texts: z
    .array(
      z.object({
        id: z.string(),
        contentLv: z.string(),
        contentEn: z.string().optional(),
      }),
    )
    .optional(),
  statements: z
    .array(
      z.object({
        id: z.string(),
        textLv: z.string(),
        answer: z.string(),
        evidenceRef: z.string().optional(),
      }),
    )
    .optional(),
  ads: z
    .array(
      z.object({
        id: z.string(),
        textLv: z.string(),
      }),
    )
    .optional(),
  situations: z
    .array(
      z.object({
        id: z.string(),
        textLv: z.string(),
        answer: z.string(),
        evidenceRef: z.string().optional(),
      }),
    )
    .optional(),
});

const metadataSchema = z
  .object({
    officialPart: z.number().int().positive(),
    officialOrder: z.number().int().positive(),
    answerKeyVersion: z.string().min(1),
  })
  .catchall(z.unknown());

export const taskSeedSchema = z.object({
  id: z.string(),
  skill: z.enum(["listening", "reading", "writing", "speaking"]),
  taskType: z.enum([
    "mcq",
    "true_false",
    "fill_blank",
    "matching",
    "cloze",
    "picture_sentence",
    "word_form",
    "message_advert",
    "interview",
    "image_description",
    "ad_question",
  ]),
  topic: z.string(),
  promptLv: z.string(),
  promptEn: z.string(),
  audioRef: z.string().nullable().optional(),
  transcript: z.string().nullable().optional(),
  questions: z.array(questionSchema),
  points: z.number().int().positive(),
  metadata: metadataSchema,
});

export const taskSeedCollectionSchema = z.array(taskSeedSchema).superRefine((tasks, ctx) => {
  const officialOrders = new Set<number>();

  tasks.forEach((task, taskIndex) => {
    if (officialOrders.has(task.metadata.officialOrder)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [taskIndex, "metadata", "officialOrder"],
        message: `officialOrder ${task.metadata.officialOrder} is duplicated`,
      });
    } else {
      officialOrders.add(task.metadata.officialOrder);
    }

    if (task.skill === "listening") {
      for (const [questionIndex, question] of task.questions.entries()) {
        if (!question.evidenceSpan && !question.evidenceRef) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [taskIndex, "questions", questionIndex],
            message: "Listening questions must include evidenceSpan or evidenceRef",
          });
        }
      }
    }

    if (task.skill === "reading" && task.taskType === "matching") {
      for (const [questionIndex, question] of task.questions.entries()) {
        if (Array.isArray(question.statements)) {
          for (const [statementIndex, statement] of question.statements.entries()) {
            if (!statement.evidenceRef) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: [taskIndex, "questions", questionIndex, "statements", statementIndex],
                message: "Reading matching statements require evidenceRef",
              });
            }
          }
        }

        if (Array.isArray(question.situations)) {
          for (const [situationIndex, situation] of question.situations.entries()) {
            if (!situation.evidenceRef) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: [taskIndex, "questions", questionIndex, "situations", situationIndex],
                message: "Reading matching situations require evidenceRef",
              });
            }
          }
        }
      }
    }
  });
});

export type TaskSeedInput = z.infer<typeof taskSeedSchema>;
