import { render } from "preact";
import ImageWorkbench from "./components/ImageWorkbench.tsx";
import "./styles.css";

function App() {
  return (
    <main className="container">
      <header className="page-header">
        <h1>Turn any image into Wires (the cat)</h1>
        <p className="intro">
          Cause why not, but now with Wires
        </p>
      </header>

      <ImageWorkbench />
    </main>
  );
}

render(<App />, document.getElementById("app")!);
