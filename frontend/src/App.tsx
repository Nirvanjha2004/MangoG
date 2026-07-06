import { Route, Switch, Router as WouterRouter } from "wouter";
import { UploadContract } from "@/components/upload-contract";
import { SignDocument } from "@/components/sign-document";
import { StatusPage } from "@/components/status-page";

function App() {
  return (
    <WouterRouter>
      <Switch>
        <Route path="/sign/:documentId" component={SignDocument} />
        <Route path="/status" component={StatusPage} />
        <Route path="/" component={UploadContract} />
      </Switch>
    </WouterRouter>
  );
}

export default App;
