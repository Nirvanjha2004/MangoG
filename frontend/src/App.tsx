import { Route, Switch, Router as WouterRouter } from "wouter";
import { UploadContract } from "@/components/upload-contract";
import { SignDocument } from "@/components/sign-document";

function App() {
  return (
    <WouterRouter>
      <Switch>
        <Route path="/sign/:documentId" component={SignDocument} />
        <Route path="/" component={UploadContract} />
      </Switch>
    </WouterRouter>
  );
}

export default App;
