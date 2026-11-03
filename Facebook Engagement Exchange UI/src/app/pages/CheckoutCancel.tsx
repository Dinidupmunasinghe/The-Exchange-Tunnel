import { Link } from "react-router";
import { Button } from "../components/ui/button";

export function CheckoutCancel() {
  return (
    <div className="mx-auto max-w-lg space-y-4 py-12 text-center">
      <h1 className="text-2xl font-bold text-foreground">Checkout cancelled</h1>
      <p className="text-muted-foreground">No charges were made. You can try again anytime.</p>
      <div className="flex justify-center gap-2">
        <Button asChild variant="outline">
          <Link to="/wallet">Back to wallet</Link>
        </Button>
        <Button asChild>
          <Link to="/">View plans</Link>
        </Button>
      </div>
    </div>
  );
}
