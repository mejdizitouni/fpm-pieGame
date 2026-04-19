import { useParams } from "react-router-dom";
import Header from "../components/layout/Header";
import Footer from "../components/layout/Footer";
import SessionManagerPanel from "../components/admin/SessionManagerPanel";
import "./Session.css"; // Import the CSS file for styling

function Session() {
  const { id } = useParams();

  return (
    <>
      <Header />
      <div className="session-container">
        <SessionManagerPanel sessionId={id} />
      </div>
      <Footer />
    </>
  );
}

export default Session;
