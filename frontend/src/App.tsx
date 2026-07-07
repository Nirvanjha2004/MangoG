import { Route, Switch, Router as WouterRouter } from "wouter";
import { LandingPage } from "@/components/landing-page";
import { UploadContract } from "@/components/upload-contract";
import { SignDocument } from "@/components/sign-document";
import { StatusPage } from "@/components/status-page";

function App() {
  return (
    <WouterRouter>
      <Switch>
        <Route path="/sign/:documentId" component={SignDocument} />
        <Route path="/upload" component={UploadContract} />
        <Route path="/status" component={StatusPage} />
        <Route path="/" component={LandingPage} />
      </Switch>
    </WouterRouter>
  );
}

export default App;
