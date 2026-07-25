implementing parallel state machines in the new state machine editor:

Phase 1: Research and Standards Alignment
CSXML Specification Review: Investigate the CSXML standard to determine the specific syntax required for supporting parallel states.
Syntax Definition: Define how the XML output must be structured to ensure it remains compliant with the standard while representing multiple parallel hierarchies.

Phase 2: Visual Editor Development
Enable Multiple Initial States: Modify the editor's hierarchy logic to allow for more than one initial state on any given level.
Support for N-Parallel Machines: Ensure the interface can handle two, three, or more state machines running in parallel on the same level.
Visual Separation: Implement the ability to draw these machines as distinct, parallel entities within the same hierarchical level.

Phase 3: Logic and Validation Rules
Connectivity Checks: Implement validation in the visual editor to ensure that parallel state machines remain entirely disconnected from one another; transitions should not be able to "jump" from one parallel machine to another.
Initial State Validation: Add a check to confirm that each disconnected state machine on a level has its own required initial state.

Phase 4: Export and Implementation Strategy
Visual-Only Focus: Focus strictly on the visual representation and editor functionality rather than the backend execution code.
XML Generation: Update the export logic to produce the correct CSXML syntax for these parallel states based on the research in Phase 1.

Phase 5: Milestone and Review
First Prototype (Crude Version): Complete a functional visual demo by July 27th.
Demo and Discussion: Present the prototype to discuss implementation details and potential issues before the full code implementation (handling the actual execution on hardware like the Raspberry Pi) is tackled by the development team at a later date