import { useEffect, useState } from "react";
import "./ScanningPage.scss";
import ScanningComponent from "../../common/components/ScanningComponent";
import pagesSvg from "../../assets/first-timer-3.svg"; 
import { useLocation } from "react-router-dom";

const ScanningPage = () => {
  const { state } = useLocation(); 
  const [ url, setUrl ] = useState(null); 

  useEffect(() => {
    console.log(state.url); 
    setUrl(state.url); 
  }, []); 

  console.log("url: ", url);
  return (
    <div id="scanning-page">
        {url && 
          <>
          <div className="scanning-page-header">
            <img src={pagesSvg}></img>
            <span><b>URL: </b>{url}</span>
          </div>
          <hr/>
          <ScanningComponent></ScanningComponent>
          </>}
    </div>
  );
};

export default ScanningPage;
