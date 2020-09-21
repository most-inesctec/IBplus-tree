import {
    IBplusLeafNode,
    IBplusInternalNode,
    Interval,
    FlatInterval
} from './internal';

/**
 * Class implementation of a generic Interval B+-Tree node
 */
export abstract class IBplusNode<T extends FlatInterval> {

    /**
     * @param order Node's order. Must be the same in all tree nodes.
     * @param parent This node's parent node. If null, node is root
     * @param keys Keys are the lower bounds of this tree subtree
     * @param maximums Maximum end point of the intervals indexed by its subtree
     */
    constructor(public readonly order: number,
        protected parent: IBplusInternalNode<T>,
        protected keys: Array<number>,
        protected maximums: Array<number>) { }

    /**
     * Get this Node children.
     * 
     * @returns the array containing the children, may it be other nodes or intervals.
     */
    abstract getChildren(): Array<any>;

    /**
     * Get this node's parent node
     */
    getParent(): IBplusInternalNode<T> | null {
        return this.parent;
    }

    /**
     * Set this node parent node
     * 
     * @param newParent new parent node
     */
    setParent(newParent: IBplusInternalNode<T>): void {
        this.parent = newParent;
    }

    /**
     * Get the minimum key out of this node keys
     */
    getMinKey(): number {
        return this.keys[0];
    }

    /**
     * Get the maximum number out of this node maximums
     */
    getMax(): number {
        return Math.max(...this.maximums)
    }

    protected findIndexInParent(): number | null {
        if (this.parent != null) {
            let children: IBplusNode<T>[] = this.parent.getChildren();

            for (let i = 0; i < children.length; ++i)
                if (children[i] == this)
                    return i;
        }

        return null;
    }

    abstract findRightSibling(): IBplusNode<T> | null;

    private findLeftSiblingAux(currentDepth: number, isAscending: boolean): IBplusNode<T> | null {
        if (isAscending) {
            // If is ascending set find a parent that has a left sibling
            let idxInParent: number = this.findIndexInParent();
            // No parent, so no left sibling
            if (idxInParent == null)
                return null;

            if (idxInParent >= 1)
                // It has a left sibling
                return this.parent.getChildren()[idxInParent - 1].findLeftSiblingAux(currentDepth, !isAscending);
            else
                // RECURSIVE: Ascend until finding a node with a left sibling
                return this.parent.findLeftSiblingAux(currentDepth + 1, isAscending);
        } else {
            // If is descending find the right most node at the same depth
            if (currentDepth == 0)
                return this;
            else {
                // Did not reach equal depth yet, descend to the rightmost child
                let children = this.getChildren();
                return children[children.length - 1].findLeftSiblingAux(currentDepth - 1, isAscending);
            }
        }
    }

    findLeftSibling(): IBplusNode<T> | null {
        return this.findLeftSiblingAux(0, true);
    }

    /**
     * Function to be called on node deletion.
     * Sets this node siblings' siblings to one each other, making this node no one's sibling
     */
    protected abstract concatSiblings();

    /**
     * Checks if this node is the root.
     * 
     * @returns true if this node is Root, false otherwise.
     */
    isRoot(): boolean {
        return this.parent == null;
    }

    /**
     * Verify if the given interval exists in the tree.
     * 
     * @param int the interval to be searched
     * @returns the object if exists, null otherwise.
     */
    abstract exists(int: T): boolean;

    /**
     * Get all intervals stored in the tree with equal bounds to the given ones.
     * 
     * @param int search interval
     * @returns Array of found intervals.
     */
    abstract search(int: FlatInterval): Set<T>;

    /**
     * Returns one interval (if there exists at least one) that intersects with the given search interval.
     * That interval is also the one with the minimum beginning point.
     * 
     * @param int search interval
     * @returns first interval intersecting the given range, or null if none does.
     */
    abstract loneRangeSearch(int: FlatInterval): T | null;

    /**
     * Returns a set with the original intervals that intersect with the given search interval.
     * 
     * @param int search interval
     */
    abstract allRangeSearch(int: FlatInterval): Set<T>;

    /**
     * Returns a set with the original intervals that are contained within the given search interval.
     * 
     * @param int search interval
     * @returns intervals contained in the given interval
     */
    abstract containedRangeSearch(int: FlatInterval): Set<T>;

    /**
     * Returns the Leaf Node where the new interval shall be inserted.
     * Returns null when the tree has no children.
     * 
     * @param int the search interval
     */
    abstract findInsertNode(int: Interval<T>): IBplusLeafNode<T> | null;

    /**
     * Splits a Node into two nodes and distibute in half the original node children.
     * After splitting, inserts the interval that triggered the split into one of the nodes.
     * 
     * @param int The interval being inserted that triggered this split
     * @returns the Leaf were the Interval ended up being inserted
     */
    protected abstract split(int: Interval<T>): IBplusLeafNode<T>;

    /**
     * Update the key and the maximum representing a node in its parent
     */
    protected updateParentValues() {
        this.parent.updateMin(this);
        this.parent.updateMax(this);
    }

    /**
     * Insert the given Interval in the tree.
     * If alpha parameter is > 0, TimeSplit is applied to a leaf node N after a
     * new interval is inserted into N and the end point of the new interval is
     * greater than the maximum end point among the intervals that were already in N.
     * 
     * @param int the interval to be inserted
     * @param alpha the value of alpha used in the PickSplitPoint algorithm. If alpha <= 0, time splits aren't used.
    */
    insert(int: Interval<T>, alpha: number): void {
        // Insertions must always start in the root -> Valid since this function is not recursive
        if (!this.isRoot())
            return this.parent.insert(int, alpha);

        // Perform a search to determine what leaf the new record should go into.
        let insertionNode: IBplusLeafNode<T> = this.findInsertNode(int);

        // No leafs in the tree
        if (insertionNode === null && this instanceof IBplusInternalNode) {
            insertionNode = new IBplusLeafNode(this.order, this);
            this.setChildren([insertionNode]);
        }

        // If we are adding and the keys's size is already equal to order, split before insertion
        if (insertionNode.keys.length >= this.order)
            // Split also inserts
            insertionNode = insertionNode.split(int);
        else
            insertionNode.addInterval(int);

        // Comparison viable since maximums and minimums were not yet updated
        if (alpha > 0 && int.getUpperBound() > this.getMax())
            insertionNode.timeSplit(this, alpha);

        insertionNode.updateParentValues();
    }

    /**
     * Finds the given interval in its tree.
     * 
     * @param int the interval to be found
     * @returns if the given interval exists, returns the leaf where it's stored
     * as well as its position in the keys of that leaf.
     * Otherwise returns null.
     */
    abstract findInterval(int: Interval<T>): [IBplusLeafNode<T>, number] | null;

    /**
     * Finds all the intervals in the tree belonging to the given interval.
     * 
     * Necessary the '| FlatInterval'  because of some supposed problem with ts.
     * For more info check the issue: https://github.com/Microsoft/TypeScript/issues/28154
     * 
     * @param int the interval defining the limits for the found intervals.
     * @returns array of Pairs containing the interval and the respective
     * leaf where it's stored.
     */
    abstract findIntervalsInRange(int: Interval<T> | FlatInterval): Array<[IBplusLeafNode<T>, Interval<T>]>;

    /**
     * Template Method.
     * Add and Update this node's new child parent.
     * 
     * @param newChild new child
     * @param insertId insertion idx
     */
    protected abstract setChildParentOnBorrow(newChild: IBplusNode<T> | Interval<T>, insertId: number): void;

    /**
     * Remove an entry from the sibling node and add it to this node
     * 
     * @param sibling The sibling this node is going to borrow from
     * @param insertId The index where the element will be inserted
     * @param removeId The index of the element going to be removed from the sibling
     */
    protected borrow(sibling: IBplusNode<T>, insertId: number, removeId: number): void {
        this.keys.splice(insertId, 0, sibling.keys.splice(removeId, 1)[0]);
        this.maximums.splice(insertId, 0, sibling.maximums.splice(removeId, 1)[0]);

        this.setChildParentOnBorrow(sibling.getChildren().splice(removeId, 1)[0], insertId);

        this.updateParentValues();
        sibling.updateParentValues();
    }

    /**
     * Template Method.
     * Updates this node's children's parents, upon Merge.
     * 
     * @param newParent The children new parent
     */
    protected abstract setChildrenParentOnMerge(newParent: IBplusNode<T>): void;

    /**
     * Template Method.
     * Set this node's substitution node, upon Merge.
     * 
     * @param node the substitution node
     */
    protected abstract setSubstitutionNode(node: IBplusNode<T>): void;

    /**
     * Merge this node into the given node
     * 
     * @param sibling The sibling to merge with
     * @param id The position where this node elements will be inserted
     */
    protected merge(sibling: IBplusNode<T>, id: number): void {
        sibling.keys.splice(id, 0, ...this.keys);
        sibling.maximums.splice(id, 0, ...this.maximums);
        sibling.getChildren().splice(id, 0, ...this.getChildren());

        this.setSubstitutionNode(sibling);
        this.setChildrenParentOnMerge(sibling);

        this.concatSiblings();
        this.parent.removeChild(this.parent.getChildren().indexOf(this));

        if (!sibling.isRoot())
            sibling.updateParentValues();
    }

    /**
     * Handle underflow by borrowing form siblings or merging with them
     */
    protected handleUnderflow() {
        // Minimum number of entries a node must have
        let minEntries: number = Math.floor(this.order / 2);
        let leftSibling: IBplusNode<T> = this.findLeftSibling();
        let rightSibling: IBplusNode<T> = this.findRightSibling();

        // Borrow from left sibling
        if (leftSibling != null && leftSibling.keys.length > minEntries)
            this.borrow(leftSibling, 0, leftSibling.keys.length - 1);

        //Borrow from right sibling
        else if (rightSibling != null && rightSibling.keys.length > minEntries)
            this.borrow(rightSibling, this.keys.length, 0);

        // Merge left sibling
        else if (leftSibling != null)
            this.merge(leftSibling, leftSibling.keys.length);

        // Merge right sibling
        else if (rightSibling != null)
            this.merge(rightSibling, 0);
    }

    /**
     * Template Method.
     * When a Node, if it is Internal, only has one child, it means the child can be the new Root.
     */
    abstract isChildNewRoot(): boolean;

    /**
     * Find out if this Node is in an underflow situation.
     * Invariant Underflow: Every node but the root must always have at least floor(order/ 2) keys.
     * 
     * @returns true if it is, false otherwise
     */
    protected isUnderflow(): boolean {
        return this.keys.length < Math.floor(this.order / 2);
    }

    /**
     * Remove the node's child in the given idx
     * http://sites.fas.harvard.edu/~cs165/papers/comer.pdf
     * http://www.cburch.com/cs/340/reading/btree/index.html#s3
     * 
     * @param idx idx of the interval
     */
    removeChild(idx: number): void {
        // Removing the interval
        this.keys.splice(idx, 1);
        this.maximums.splice(idx, 1);
        this.getChildren().splice(idx, 1);

        if (this.isChildNewRoot()) {
            this.getChildren()[0].setParent(null); //new Root
            return;
        }

        if (this.isUnderflow())
            this.handleUnderflow();
        else if (!this.isRoot())
            this.updateParentValues(); // Update parent keys
    }

    /**
     * Represents the current tree as a string.
     * Useful for printing purposes.
     * 
     * @param acc The accumulated results of the other nodes strings
     * @param depth The current node depth
     * @returns The accumulated string, incremented with this node
     */
    abstract asString(acc: string, depth: number): string;
}