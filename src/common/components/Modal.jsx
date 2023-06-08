const Modal = ({
    isTopTitle,
    showCloseButton,
    modalTitle, 
    modalBody, 
    modalDesc, 
    modalFooter, 
    pageIndicator, 
    key,
}) => {
    return (
        <div className="modal">
            <div className="modal-container">
                {showCloseButton && 
                    <div className="modal-header-button">
                        <button id="close-button">Close</button>
                    </div>
                }
                <div key={key} className="modal-content in">
                    {isTopTitle && <h3 className="modal-title">{modalTitle}</h3>}
                    {modalBody}
                    {!isTopTitle && <h3 className="modal-title">{modalTitle}</h3>}
                    <p className="modal-desc">{modalDesc}</p>
                </div>
                {pageIndicator && <div className="page-indicator">{pageIndicator}</div>}
                <div className="modal-footer-button">{modalFooter}</div>
            </div>
        </div>
    )
}

export default Modal;