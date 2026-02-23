import { ReviewBoard } from "@/components/ReviewBoard";
import { getReviewCards } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const cards = await getReviewCards();

  return <ReviewBoard cards={cards.map((card) => ({ ...card, dueDate: card.dueDate.toISOString() }))} />;
}
